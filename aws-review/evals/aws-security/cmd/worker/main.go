package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"net/http"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
)

func newAWSConfig(ctx context.Context) (aws.Config, error) {
	return config.LoadDefaultConfig(ctx,
		config.WithRegion("us-east-1"),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider("AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "")),
	)
}

func partnerToken(ctx context.Context, cfg aws.Config) (string, error) {
	sm := secretsmanager.NewFromConfig(cfg)
	out, err := sm.GetSecretValue(ctx, &secretsmanager.GetSecretValueInput{
		SecretId: aws.String(os.Getenv("PARTNER_TOKEN_SECRET_ARN")),
	})
	if err != nil {
		return "", fmt.Errorf("get partner token: %w", err)
	}
	return aws.ToString(out.SecretString), nil
}

var partnerClient = &http.Client{
	Transport: &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	},
}

func handler(ctx context.Context, evt events.SQSEvent) error {
	cfg, err := newAWSConfig(ctx)
	if err != nil {
		return err
	}
	token, err := partnerToken(ctx, cfg)
	if err != nil {
		return err
	}

	for _, msg := range evt.Records {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://partner.example.com/orders", bytes.NewBufferString(msg.Body))
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")

		resp, err := partnerClient.Do(req)
		if err != nil {
			return fmt.Errorf("post order %s: %w", msg.MessageId, err)
		}
		resp.Body.Close()
		if resp.StatusCode >= 300 {
			return fmt.Errorf("partner returned %d for %s", resp.StatusCode, msg.MessageId)
		}
	}
	return nil
}

func main() {
	lambda.Start(handler)
}
