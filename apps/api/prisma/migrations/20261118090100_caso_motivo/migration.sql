-- P11 · motivo do encaminhamento manual no caso (destinos sem notificação ao CRAS).
-- AlterTable
ALTER TABLE "casos"."caso" ADD COLUMN     "motivo" VARCHAR(2000);

