package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"os"
	"strconv"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type usageEvent struct {
	AccountID string `json:"accountId"`
	Units     int    `json:"units"`
}

var (
	ddb       *dynamodb.Client
	tableName = os.Getenv("USAGE_TABLE")
)

func init() {
	cfg, err := config.LoadDefaultConfig(context.TODO())
	if err != nil {
		log.Fatalf("load aws config: %v", err)
	}
	ddb = dynamodb.NewFromConfig(cfg)
}

func handler(ctx context.Context, e events.EventBridgeEvent) error {
	var u usageEvent
	if err := json.Unmarshal(e.Detail, &u); err != nil {
		log.Fatalf("bad usage event %s: %v", e.ID, err)
	}

	_, err := ddb.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(tableName),
		Key: map[string]types.AttributeValue{
			"pk": &types.AttributeValueMemberS{Value: "ACCOUNT#" + u.AccountID},
		},
		UpdateExpression:         aws.String("ADD #units :u SET #lastEvent = :id"),
		ConditionExpression:      aws.String("attribute_not_exists(#lastEvent) OR #lastEvent <> :id"),
		ExpressionAttributeNames: map[string]string{"#units": "units", "#lastEvent": "lastEventId"},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":u":  &types.AttributeValueMemberN{Value: strconv.Itoa(u.Units)},
			":id": &types.AttributeValueMemberS{Value: e.ID},
		},
	})
	var dup *types.ConditionalCheckFailedException
	if errors.As(err, &dup) {
		return nil
	}
	return err
}

func main() {
	lambda.Start(handler)
}
