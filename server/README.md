# X Cup server routes

X Cup runs inside a single Express backend shared with XSight and Hook so
all three products use the same wallet, x402 verifier, and Postgres
indexer state.

The X Cup-specific server slice lives in the umbrella repo:

- **Routes** — [`server/src/routes/cup.ts`](https://github.com/kravadk/XSight/blob/main/server/src/routes/cup.ts)
  and [`server/src/routes/markets.ts`](https://github.com/kravadk/XSight/blob/main/server/src/routes/markets.ts)
- **Services** — `server/src/services/cup*.ts`, `parimutuel*.ts`, `bracket*.ts`,
  `fanPassSbt.ts`, `freePool*.ts`, `league*.ts`, `leaderboard*.ts`,
  `market*.ts`, `pundit*.ts`, `quorumResolver.ts`
- **Deploy / seed scripts** — local at [`../scripts/`](../scripts/)
- **Contracts** — local at [`../contracts/`](../contracts/)

Run the backend from the umbrella root:

```
npm --prefix server install
npm --prefix server run dev   # tsx watch on :8787
```

The X Cup endpoints land at `/api/cup/*` and `/api/markets/*`.
