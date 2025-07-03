run these commands:

```
npm run prisma:migrate:reset
npm run prisma:push
npm run push
rm -rf logs/

redis-cli -h localhost flushall


npm run sync:range -- --from 1051000 --to 1051002

timeout 300 npm run dev
```

then check the database for any missing data, then check logs & bull MQ for any failures/errors, note them down to rectify them.

