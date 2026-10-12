package main

import (
	"bufio"
	"context"
	"log"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// Removes exported reports whose report ID no longer appears in the manifest.
func main() {
	ctx := context.Background()
	bucket := os.Getenv("REPORTS_BUCKET")

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		log.Fatal(err)
	}
	client := s3.NewFromConfig(cfg)

	active, err := readManifest(ctx, client, bucket)
	if err != nil {
		log.Fatal(err)
	}

	out, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(bucket),
		Prefix: aws.String("reports/"),
	})
	if err != nil {
		log.Fatal(err)
	}

	var orphans []types.ObjectIdentifier
	for _, obj := range out.Contents {
		id := strings.TrimSuffix(strings.TrimPrefix(aws.ToString(obj.Key), "reports/"), ".pdf")
		if !active[id] {
			orphans = append(orphans, types.ObjectIdentifier{Key: obj.Key})
		}
	}

	for start := 0; start < len(orphans); start += 1000 {
		end := min(start+1000, len(orphans))
		_, err := client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
			Bucket: aws.String(bucket),
			Delete: &types.Delete{Objects: orphans[start:end], Quiet: aws.Bool(true)},
		})
		if err != nil {
			log.Fatal(err)
		}
	}

	log.Printf("deleted %d orphaned reports", len(orphans))
}

func readManifest(ctx context.Context, client *s3.Client, bucket string) (map[string]bool, error) {
	out, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String("manifest/active-ids.txt"),
	})
	if err != nil {
		return nil, err
	}
	defer out.Body.Close()

	active := map[string]bool{}
	scanner := bufio.NewScanner(out.Body)
	for scanner.Scan() {
		if id := strings.TrimSpace(scanner.Text()); id != "" {
			active[id] = true
		}
	}
	return active, scanner.Err()
}
