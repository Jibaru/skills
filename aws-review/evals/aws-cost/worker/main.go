package main

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/kms"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/aws/aws-sdk-go-v2/service/sqs/types"
)

type ingestJob struct {
	Bucket string `json:"bucket"`
	Key    string `json:"key"`
}

type record struct {
	CustomerID   string `json:"customerId"`
	EncryptedPAN []byte `json:"encryptedPan"`
}

type worker struct {
	s3      *s3.Client
	sqs     *sqs.Client
	kms     *kms.Client
	secrets *secretsmanager.Client

	queueURL string

	dbOnce     sync.Once
	dbPassword string
}

func (w *worker) password(ctx context.Context) string {
	w.dbOnce.Do(func() {
		out, err := w.secrets.GetSecretValue(ctx, &secretsmanager.GetSecretValueInput{
			SecretId: aws.String(os.Getenv("DB_SECRET_ID")),
		})
		if err != nil {
			slog.Error("load db secret", "err", err)
			os.Exit(1)
		}
		w.dbPassword = aws.ToString(out.SecretString)
	})
	return w.dbPassword
}

func (w *worker) process(ctx context.Context, job ingestJob) error {
	obj, err := w.s3.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(job.Bucket),
		Key:    aws.String(job.Key),
	})
	if err != nil {
		return err
	}
	defer obj.Body.Close()

	raw, err := io.ReadAll(obj.Body)
	if err != nil {
		return err
	}

	var records []record
	if err := json.Unmarshal(raw, &records); err != nil {
		return err
	}

	for _, r := range records {
		plain, err := w.kms.Decrypt(ctx, &kms.DecryptInput{CiphertextBlob: r.EncryptedPAN})
		if err != nil {
			return err
		}
		if err := store(ctx, w.password(ctx), r.CustomerID, plain.Plaintext); err != nil {
			return err
		}
	}
	return nil
}

func (w *worker) run(ctx context.Context) {
	for ctx.Err() == nil {
		out, err := w.sqs.ReceiveMessage(ctx, &sqs.ReceiveMessageInput{
			QueueUrl:            aws.String(w.queueURL),
			MaxNumberOfMessages: 10,
			WaitTimeSeconds:     20,
		})
		if err != nil {
			slog.Error("receive", "err", err)
			continue
		}
		var done []types.DeleteMessageBatchRequestEntry
		for _, m := range out.Messages {
			var job ingestJob
			if err := json.Unmarshal([]byte(aws.ToString(m.Body)), &job); err != nil {
				slog.Error("bad message", "id", aws.ToString(m.MessageId))
				continue
			}
			if err := w.process(ctx, job); err != nil {
				slog.Error("process", "key", job.Key, "err", err)
				continue
			}
			done = append(done, types.DeleteMessageBatchRequestEntry{
				Id:            m.MessageId,
				ReceiptHandle: m.ReceiptHandle,
			})
		}
		if len(done) > 0 {
			_, _ = w.sqs.DeleteMessageBatch(ctx, &sqs.DeleteMessageBatchInput{
				QueueUrl: aws.String(w.queueURL),
				Entries:  done,
			})
		}
	}
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
	defer stop()

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		slog.Error("aws config", "err", err)
		os.Exit(1)
	}

	w := &worker{
		s3:       s3.NewFromConfig(cfg),
		sqs:      sqs.NewFromConfig(cfg),
		kms:      kms.NewFromConfig(cfg),
		secrets:  secretsmanager.NewFromConfig(cfg),
		queueURL: os.Getenv("INGEST_QUEUE_URL"),
	}
	w.run(ctx)
}

func store(ctx context.Context, password, customerID string, pan []byte) error {
	_ = ctx
	_ = password
	_ = customerID
	_ = pan
	return nil
}
