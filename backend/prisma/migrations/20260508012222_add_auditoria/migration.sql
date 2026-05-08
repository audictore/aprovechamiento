-- CreateTable
CREATE TABLE "Auditoria" (
    "id" SERIAL NOT NULL,
    "cuatrimestreId" INTEGER NOT NULL,
    "docenteId" INTEGER NOT NULL,
    "materia" TEXT NOT NULL,
    "grupo" TEXT NOT NULL DEFAULT '',
    "planProfesor" BOOLEAN NOT NULL DEFAULT false,
    "planCoordinador" BOOLEAN NOT NULL DEFAULT false,
    "planFechaRevision" TEXT NOT NULL DEFAULT '',
    "planFechaElab" TEXT NOT NULL DEFAULT '',
    "presentacion" BOOLEAN NOT NULL DEFAULT false,
    "p1Conocimiento" BOOLEAN NOT NULL DEFAULT false,
    "p1Producto" BOOLEAN NOT NULL DEFAULT false,
    "p1Desempeno" BOOLEAN NOT NULL DEFAULT false,
    "p1Asistencia" BOOLEAN NOT NULL DEFAULT false,
    "p1Calificaciones" BOOLEAN NOT NULL DEFAULT false,
    "p2Conocimiento" BOOLEAN NOT NULL DEFAULT false,
    "p2Producto" BOOLEAN NOT NULL DEFAULT false,
    "p2Desempeno" BOOLEAN NOT NULL DEFAULT false,
    "p2Asistencia" BOOLEAN NOT NULL DEFAULT false,
    "p2Calificaciones" BOOLEAN NOT NULL DEFAULT false,
    "p3Conocimiento" BOOLEAN NOT NULL DEFAULT false,
    "p3Producto" BOOLEAN NOT NULL DEFAULT false,
    "p3Desempeno" BOOLEAN NOT NULL DEFAULT false,
    "p3Asistencia" BOOLEAN NOT NULL DEFAULT false,
    "p3Calificaciones" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Auditoria_cuatrimestreId_docenteId_materia_key" ON "Auditoria"("cuatrimestreId", "docenteId", "materia");

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_cuatrimestreId_fkey" FOREIGN KEY ("cuatrimestreId") REFERENCES "Cuatrimestre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_docenteId_fkey" FOREIGN KEY ("docenteId") REFERENCES "Docente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
