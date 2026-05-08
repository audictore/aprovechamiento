-- CreateTable
CREATE TABLE "Cuatrimestre" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "Cuatrimestre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramaEducativo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "cuatrimestreId" INTEGER NOT NULL,

    CONSTRAINT "ProgramaEducativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parcial" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "programaId" INTEGER NOT NULL,

    CONSTRAINT "Parcial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grupo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tutor" TEXT NOT NULL DEFAULT '',
    "alumnos" INTEGER NOT NULL DEFAULT 0,
    "bajas" INTEGER NOT NULL DEFAULT 0,
    "reprobados" INTEGER NOT NULL DEFAULT 0,
    "parcialId" INTEGER NOT NULL,

    CONSTRAINT "Grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Docente" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Docente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Materia" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "promedio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reprobados" INTEGER NOT NULL DEFAULT 0,
    "grupoId" INTEGER NOT NULL,
    "docenteId" INTEGER,

    CONSTRAINT "Materia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cuatrimestre_nombre_key" ON "Cuatrimestre"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramaEducativo_cuatrimestreId_nombre_key" ON "ProgramaEducativo"("cuatrimestreId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Parcial_programaId_numero_key" ON "Parcial"("programaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Docente_nombre_key" ON "Docente"("nombre");

-- AddForeignKey
ALTER TABLE "ProgramaEducativo" ADD CONSTRAINT "ProgramaEducativo_cuatrimestreId_fkey" FOREIGN KEY ("cuatrimestreId") REFERENCES "Cuatrimestre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcial" ADD CONSTRAINT "Parcial_programaId_fkey" FOREIGN KEY ("programaId") REFERENCES "ProgramaEducativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grupo" ADD CONSTRAINT "Grupo_parcialId_fkey" FOREIGN KEY ("parcialId") REFERENCES "Parcial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Materia" ADD CONSTRAINT "Materia_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Materia" ADD CONSTRAINT "Materia_docenteId_fkey" FOREIGN KEY ("docenteId") REFERENCES "Docente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
