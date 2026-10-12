/**
 * Roda antes de cada arquivo de teste (setupFiles no vite.config.js) e
 * congela a data em HOJE. hojeISO() e todo `new Date()` do código passam a
 * devolver sempre o mesmo dia: nenhum teste depende do dia em que roda.
 *
 * Só a data é congelada — setTimeout e promessas seguem reais. O teste que
 * precisa de outro dia chama vi.setSystemTime por conta própria (como
 * planilha.test.js e tratamento-e-ocorrencia.test.js).
 */
import { vi } from 'vitest';
import { HOJE } from './hoje.js';

vi.setSystemTime(new Date(`${HOJE}T12:00:00Z`));
