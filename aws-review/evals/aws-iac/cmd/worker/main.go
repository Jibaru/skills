package main

import (
	"context"
	"encoding/json"
	"log"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

type order struct {
	PK     string `dynamodbav:"pk" json:"id"`
	Status string `dynamodbav:"status" json:"status"`
}

var client *dynamodb.Client

func handler(ctx context.Context, evt events.SQSEvent) error {
	for _, rec := range evt.Records {
		var o order
		if err := json.Unmarshal([]byte(rec.Body), &o); err != nil {
			return err
		}
		item, err := attributevalue.MarshalMap(o)
		if err != nil {
			return err
		}
		if _, err := client.PutItem(ctx, &dynamodb.PutItemInput{
			TableName: aws.String("orders-prod"),
			Item:      item,
		}); err != nil {
			return err
		}
	}
	return nil
}

func main() {
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		log.Fatal(err)
	}
	client = dynamodb.NewFromConfig(cfg)
	lambda.Start(handler)
}
