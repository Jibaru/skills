/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "acme-imports",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    const imports = new sst.aws.Bucket("Imports", {
      cors: false,
    });

    new aws.s3.BucketLifecycleConfiguration("ImportsLifecycle", {
      bucket: imports.name,
      rules: [
        {
          id: "abort-mpu",
          status: "Enabled",
          filter: {},
          abortIncompleteMultipartUpload: { daysAfterInitiation: 7 },
        },
      ],
    });

    imports.notify({
      notifications: [
        {
          name: "ConvertCsv",
          function: {
            handler: "src/convert.handler",
            link: [imports],
            timeout: "1 minute",
          },
          events: ["s3:ObjectCreated:*"],
        },
      ],
    });

    return { bucket: imports.name };
  },
});
