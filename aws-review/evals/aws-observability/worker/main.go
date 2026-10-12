package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-lambda-go/lambdacontext"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

type order struct {
	OrderID    string  `json:"orderId" dynamodbav:"orderId"`
	CustomerID string  `json:"customerId" dynamodbav:"customerId"`
	Total      float64 `json:"total" dynamodbav:"total"`
}

type worker struct {
	ddb   *dynamodb.Client
	table string
}

func (w *worker) handle(ctx context.Context, e events.SQSEvent) (events.SQSEventResponse, error) {
	var resp events.SQSEventResponse
	for _, r := range e.Records {
		var o order
		if err := json.Unmarshal([]byte(r.Body), &o); err != nil {
			slog.ErrorContext(ctx, "bad message", "messageId", r.MessageId, "err", err)
			resp.BatchItemFailures = append(resp.BatchItemFailures, events.SQSBatchItemFailure{ItemIdentifier: r.MessageId})
			continue
		}
		item, err := attributevalue.MarshalMap(o)
		if err != nil {
			return resp, fmt.Errorf("marshal %s: %w", o.OrderID, err)
		}
		_, err = w.ddb.PutItem(context.TODO(), &dynamodb.PutItemInput{
			TableName: aws.String(w.table),
			Item:      item,
		})
		if err != nil {
			slog.ErrorContext(ctx, "store order failed", "orderId", o.OrderID, "err", err)
			resp.BatchItemFailures = append(resp.BatchItemFailures, events.SQSBatchItemFailure{ItemIdentifier: r.MessageId})
			continue
		}
		slog.InfoContext(ctx, "order stored", "orderId", o.OrderID)
	}
	return resp, nil
}

func main() {
	slog.SetDefault(lambdacontext.NewLogger())

	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		slog.Error("load aws config", "err", err)
		os.Exit(1)
	}
	w := &worker{ddb: dynamodb.NewFromConfig(cfg), table: os.Getenv("TABLE_NAME")}
	lambda.Start(w.handle)
}
