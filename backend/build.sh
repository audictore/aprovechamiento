#!/bin/bash
echo "Cambiando provider a postgresql..."
sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
echo "Instalando dependencias..."
npm install
echo "Generando cliente Prisma..."
npx prisma generate
echo "Aplicando migraciones..."
npx prisma db push
echo "Build completado"