package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/aws/aws-sdk-go-v2/service/sqs/types"
)

type Job struct {
	ID     string `json:"id"`
	Report string `json:"report"`
}

type Result struct {
	JobID string `json:"jobId"`
	URL   string `json:"url"`
}

func main() {
	ctx := context.Background()
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		log.Fatal(err)
	}
	client := sqs.NewFromConfig(cfg)
	jobsURL := os.Getenv("JOBS_QUEUE_URL")
	resultsURL := os.Getenv("RESULTS_QUEUE_URL")

	for {
		out, err := client.ReceiveMessage(ctx, &sqs.ReceiveMessageInput{
			QueueUrl: aws.String(jobsURL),
		})
		if err != nil {
			log.Printf("receive: %v", err)
			time.Sleep(time.Second)
			continue
		}
		if len(out.Messages) == 0 {
			time.Sleep(100 * time.Millisecond)
			continue
		}

		var results []types.SendMessageBatchRequestEntry
		var done []types.DeleteMessageBatchRequestEntry
		for i, msg := range out.Messages {
			var job Job
			if err := json.Unmarshal([]byte(aws.ToString(msg.Body)), &job); err != nil {
				log.Printf("bad job %s: %v", aws.ToString(msg.MessageId), err)
				continue
			}
			url, err := render(ctx, job)
			if err != nil {
				log.Printf("render %s: %v", job.ID, err)
				continue
			}
			body, _ := json.Marshal(Result{JobID: job.ID, URL: url})
			id := fmt.Sprintf("m%d", i)
			results = append(results, types.SendMessageBatchRequestEntry{Id: aws.String(id), MessageBody: aws.String(string(body))})
			done = append(done, types.DeleteMessageBatchRequestEntry{Id: aws.String(id), ReceiptHandle: msg.ReceiptHandle})
		}
		if len(results) == 0 {
			continue
		}

		if _, err := client.SendMessageBatch(ctx, &sqs.SendMessageBatchInput{
			QueueUrl: aws.String(resultsURL),
			Entries:  results,
		}); err != nil {
			log.Printf("send results: %v", err)
			continue
		}

		del, err := client.DeleteMessageBatch(ctx, &sqs.DeleteMessageBatchInput{
			QueueUrl: aws.String(jobsURL),
			Entries:  done,
		})
		if err != nil {
			log.Printf("delete: %v", err)
			continue
		}
		for _, f := range del.Failed {
			log.Printf("delete failed for %s: %s", aws.ToString(f.Id), aws.ToString(f.Message))
		}
	}
}

func render(ctx context.Context, job Job) (string, error) {
	// Renders the report and uploads it; takes a few seconds.
	return "s3://reports/" + job.ID + ".pdf", nil
}
