/**
 * Prova que nenhum teste depende da data em que roda: executa a suíte
 * inteira com o relógio da máquina adiantado em 30, 90 e 365 dias.
 *
 *   npm run test:relogio            (30, 90 e 365)
 *   node tests/relogio/executar.mjs 0 45 730
 */
import { spawnSync } from 'node:child_process';

const dias = process.argv
  .slice(2)
  .map(Number)
  .filter((n) => Number.isFinite(n));
const saltos = dias.length ? dias : [30, 90, 365];
let falhou = false;

for (const d of saltos) {
  const quando = new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  const r = spawnSync(
    process.execPath,
    ['node_modules/vitest/vitest.mjs', 'run', '--reporter=dot'],
    {
      env: {
        ...process.env,
        SOUZ_DIAS: String(d),
        NODE_OPTIONS:
          `${process.env.NODE_OPTIONS || ''} --import ./tests/relogio/deslocar.mjs`.trim(),
      },
      encoding: 'utf8',
    },
  );
  const saida = `${r.stdout || ''}${r.stderr || ''}`.replace(/\u001b\[[0-9;]*m/g, '');
  const resumo = (/^\s*Tests\s+(.+)$/m.exec(saida) || [])[1] || 'sem resumo';
  const ok = r.status === 0;
  console.warn(
    `${ok ? 'ok  ' : 'FALHA'}  +${String(d).padStart(3)} dias (${quando}): ${resumo.trim()}`,
  );
  if (!ok) {
    falhou = true;
    const falhas = saida.split('\n').filter((l) => /^\s*(FAIL|×)\s/.test(l));
    console.warn(falhas.slice(0, 40).join('\n'));
  }
}
process.exit(falhou ? 1 : 0);
