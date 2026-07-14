// Jest setupFiles entry — baseline environment for every suite.
// Individual suites tweak/restore process.env locally (OLD_ENV pattern).
process.env.SOURCE_BUCKETS = "source-bucket, bucket-b";
process.env.GCP_PROJECT = "test-project";
