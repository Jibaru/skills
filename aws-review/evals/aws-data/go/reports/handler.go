package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/rds/auth"
	_ "github.com/go-sql-driver/mysql"
)

var (
	awsCfg   aws.Config
	endpoint = os.Getenv("DB_PROXY_ENDPOINT") + ":3306"
	dbUser   = os.Getenv("DB_USER")
)

type dailyTotal struct {
	Day   string  `json:"day"`
	Total float64 `json:"total"`
}

func handler(ctx context.Context, req events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	from := req.QueryStringParameters["from"]

	token, err := auth.BuildAuthToken(ctx, endpoint, awsCfg.Region, dbUser, awsCfg.Credentials)
	if err != nil {
		return events.APIGatewayV2HTTPResponse{StatusCode: 500}, err
	}
	dsn := fmt.Sprintf("%s:%s@tcp(%s)/reports?tls=true&allowCleartextPasswords=true&interpolateParams=true", dbUser, token, endpoint)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return events.APIGatewayV2HTTPResponse{StatusCode: 500}, err
	}
	defer db.Close()

	rows, err := db.QueryContext(ctx, "SELECT day, SUM(total) FROM sales WHERE day >= ? GROUP BY day ORDER BY day", from)
	if err != nil {
		return events.APIGatewayV2HTTPResponse{StatusCode: 500}, err
	}
	defer rows.Close()

	var out []dailyTotal
	for rows.Next() {
		var d dailyTotal
		if err := rows.Scan(&d.Day, &d.Total); err != nil {
			return events.APIGatewayV2HTTPResponse{StatusCode: 500}, err
		}
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		return events.APIGatewayV2HTTPResponse{StatusCode: 500}, err
	}

	body, _ := json.Marshal(out)
	return events.APIGatewayV2HTTPResponse{StatusCode: 200, Body: string(body)}, nil
}

func main() {
	var err error
	awsCfg, err = config.LoadDefaultConfig(context.Background())
	if err != nil {
		panic(err)
	}
	lambda.Start(handler)
}
