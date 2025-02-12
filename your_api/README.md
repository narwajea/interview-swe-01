# Your API

Transaction processing service that handles requests from a client application, communicates with a third-party service, manages transaction states and push transaction updates to the client.

## Features

- Asynchronous transaction processing with BullMQ queues
- Automatic retries with configurable backoff strategies
- Distributed locking to prevent concurrent/duplicate processing
- State management with TTL in Redis
- Structured logging with component identification
- Input validation with detailed error messages
- Dependency injection for better testability
- Transaction state tracking across retries

## Run locally

Either you have nodejs on your machine, and you can run it with this command:

```
npm run build && PORT=<SOME_PORT> REDIS_HOST=<SOME_REDIS_HOST> REDIS_PORT=<SOME_REDIS_PORT> THIRDPARTY_URL=<URL_OF_THE_THIRDPARTY> YOUR_API_URL=<URL_OF_YOUR_API> CLIENT_URL=<URL_OF_MOBILE_APP> npm run start
```

Alternatively, you can run the whole stack by installing dependencies in each project with `npm i` then running (at the root of the repository):

```
npm run dev
```

Or you can start it with Docker:

```
docker build . -t djamo/your_api
docker run -p "<SOME_PORT>:3000" -e REDIS_HOST=<SOME_REDIS_HOST> -e REDIS_PORT=<SOME_REDIS_PORT> -e THIRDPARTY_URL=<URL_OF_THE_THIRDPARTY> -e YOUR_API_URL=<URL_OF_YOUR_API> -e CLIENT_URL=<URL_OF_MOBILE_APP> --rm djamo/your_api
```

## Environment Variables

- `PORT`: API port (default: 3200)
- `REDIS_HOST`: Redis host (default: localhost)
- `REDIS_PORT`: Redis port (default: 6379)
- `THIRDPARTY_URL`: Third party service URL (default: http://localhost:3000)
- `YOUR_API_URL`: Your API URL for webhooks (default: http://localhost:3200)
- `CLIENT_URL`: Client service URL (default: http://localhost:3100)

## Endpoints

### POST /transaction

Will process a transaction request taking the following body as input:

```json
{
  "id": "<random uuid>"
}
```

Response:

```json
{
  "id": "<uuid>",
  "status": "pending"
}
```

### POST /webhook

Will process a webhook request taking the following body as input:

```json
{
  "id": "<random uuid>",
  "status": "<completed|declined>"
}
```

## Error Handling

- Valid inputs return 200
- Invalid inputs return 400 with validation details
- Internal errors return 500 with error logging

## Architecture

### Technologies

- Express.js for HTTP server
- BullMQ for job queues
- IORedis for state management
- Winston for logging
- Zod for input validation
- TSyringe for dependency injection

### Development Tools

- TypeScript
- ESLint
- Prettier
- Nodemon

## Scripts

- `npm run dev`: Start development server with hot reload
- `npm run build`: Build TypeScript code
- `npm start`: Run production server
- `npm run lint`: Check code style
- `npm run lint:fix`: Fix code style issues
- `npm run format`: Format code with Prettier
- `npm run format:check`: Check code formatting

## Implementation Details

### Transaction States

- `sent`: Successfully sent to third-party
- `maybe_sent`: Request to third-party timed out, status unknown
- `completed`: Transaction completed successfully by third-party
- `declined`: Transaction declined by third-party

### Retry Mechanisms

The following processes may be retried until we get a definitive result from third-party:

- Transaction processing
- Third-party checks

### Flow

1. Client sends transaction request with UUID
2. API queues transaction for processing
3. Worker processes transaction:
   - Checks for existing state
   - Attempts to send to third-party
   - Handles timeouts and retries
4. Status tracking:
   - Third-party sends webhook with final status
   - Or recurring checks will get final status from the status check API
5. API updates client with final status

### Technical considerations & possible improvements

- Business logic is not well organized accross components due to lack of time
- Pushing transaction updates to the client could (should) be implemented with a proper mechanism, e.g. WebSocket, GraphQL subscription, etc. avoiding the client application to act as a server.
- Final state of transactions could be persisted in a database.
- E2E tests could be added to simulate the nominal case along with all edge cases.
- Metrics and monitoring could be added (e.g., Prometheus/Grafana)
- Circuit breaker could be implemented for third-party calls
- Rate limiting could be added to protect the API
- Health check endpoint could be added
- API documentation could be added (e.g., OpenAPI/Swagger)

## Project Structure

```
src/
├── controllers/     # HTTP request handlers
├── processors/      # Queue job processors
├── services/        # Business logic
├── schemas/         # Data validation schemas
├── types/          # TypeScript interfaces
├── utils/          # Shared utilities
├── container.ts    # Dependency injection setup
└── index.ts        # Application entry point
```
