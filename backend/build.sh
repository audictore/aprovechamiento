#!/bin/bash
sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
npm install
npx prisma generate
npx prisma db push