package inventory

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

var (
	client    *dynamodb.Client
	tableName = os.Getenv("INVENTORY_TABLE")
)

var ErrOutOfStock = errors.New("out of stock")

func init() {
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		panic(err)
	}
	client = dynamodb.NewFromConfig(cfg)
}

type stockItem struct {
	SKU   string `dynamodbav:"pk"`
	Stock int    `dynamodbav:"stock"`
}

// Reserve takes qty units of sku out of stock for a checkout.
func Reserve(ctx context.Context, sku string, qty int) error {
	key := map[string]types.AttributeValue{
		"pk": &types.AttributeValueMemberS{Value: "SKU#" + sku},
	}

	out, err := client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(tableName),
		Key:       key,
	})
	if err != nil {
		return fmt.Errorf("get stock: %w", err)
	}
	if out.Item == nil {
		return fmt.Errorf("unknown sku %q", sku)
	}

	var item stockItem
	if err := attributevalue.UnmarshalMap(out.Item, &item); err != nil {
		return err
	}
	if item.Stock < qty {
		return ErrOutOfStock
	}

	_, err = client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:        aws.String(tableName),
		Key:              key,
		UpdateExpression: aws.String("SET stock = :stock"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":stock": &types.AttributeValueMemberN{Value: strconv.Itoa(item.Stock - qty)},
		},
	})
	return err
}
