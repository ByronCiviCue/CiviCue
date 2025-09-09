Error contract
- error.kind is a string ('HttpError' | 'RetryExhausted').
- Details are sibling fields: status, attempts, url, message. 4xx are not retried except 429, which honors Retry-After/backoff.

