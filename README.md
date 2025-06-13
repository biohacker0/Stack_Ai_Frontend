# Stack AI Frontend

A modern web application built with Next.js for Stack AI services.

## Quick Start

### Prerequisites

- Node.js 18+
- npm, yarn, pnpm, or bun

### Installation & Setup

1. **Clone the repository**

```bash
git clone https://github.com/biohacker0/stack-ai-frontend.git
cd stack-ai-frontend
```

2. **Install dependencies**

```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

3. **Environment Setup**

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_AUTH_EMAIL=stackaitest@gmail.com
NEXT_PUBLIC_AUTH_PASSWORD="!z4ZnxkyLYs#vR"
```

4. **Start the development server**

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Environment Variables

| Variable                    | Description             | Default                 |
| --------------------------- | ----------------------- | ----------------------- |
| `NEXT_PUBLIC_API_BASE_URL`  | Backend API URL         | `http://localhost:8000` |
| `NEXT_PUBLIC_AUTH_EMAIL`    | Authentication email    | -                       |
| `NEXT_PUBLIC_AUTH_PASSWORD` | Authentication password | -                       |
