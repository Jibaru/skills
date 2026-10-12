package producer

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/kinesis"
	"github.com/aws/aws-sdk-go-v2/service/kinesis/types"
)

type Click struct {
	ClickID string    `json:"clickId"`
	UserID  string    `json:"userId"`
	Path    string    `json:"path"`
	At      time.Time `json:"at"`
}

type Publisher struct {
	client *kinesis.Client
	stream string
}

func (p *Publisher) Publish(ctx context.Context, clicks []Click) error {
	entries := make([]types.PutRecordsRequestEntry, 0, len(clicks))
	for _, c := range clicks {
		data, err := json.Marshal(c)
		if err != nil {
			return err
		}
		entries = append(entries, types.PutRecordsRequestEntry{
			Data:         data,
			PartitionKey: aws.String("clicks"),
		})
	}

	for attempt := 0; len(entries) > 0; attempt++ {
		if attempt == 5 {
			return fmt.Errorf("kinesis: %d records still failing", len(entries))
		}
		out, err := p.client.PutRecords(ctx, &kinesis.PutRecordsInput{
			StreamName: aws.String(p.stream),
			Records:    entries,
		})
		if err != nil {
			return err
		}
		if aws.ToInt32(out.FailedRecordCount) == 0 {
			return nil
		}
		var retry []types.PutRecordsRequestEntry
		for i, r := range out.Records {
			if r.ErrorCode != nil {
				retry = append(retry, entries[i])
			}
		}
		entries = retry
		time.Sleep(time.Duration(100<<attempt) * time.Millisecond)
	}
	return nil
}
