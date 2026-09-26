# Taller Backend — NestJS + Prisma

Backend API for the OBD-II vehicle diagnostic platform.

## Prerequisites

- Node.js 22 LTS
- Docker Desktop (for PostgreSQL + n8n)

## Quick Start

```bash
# 1. Start PostgreSQL and n8n
docker compose up -d

# 2. Install dependencies
npm install

# 3. Run database migration
npx prisma migrate dev --name init

# 4. Start development server
npm run start:dev
```

The API will be available at `http://localhost:3000/api`

## Auth Endpoints

- `POST /api/auth/register` — Register a new user
- `POST /api/auth/login` — Login and get JWT token
- `GET /api/auth/profile` — Get current user profile (requires Bearer token)

## Environment Variables

Copy `.env.example` to `.env` and configure the values.
