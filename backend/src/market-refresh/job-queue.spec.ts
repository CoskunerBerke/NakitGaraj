import { createJobs, JobGranularityError, JobQueue, MAX_JOBS_V1 } from './job-queue';

const specs = [
  { source: 'SAHIBINDEN_HTML', make: 'Audi', family: 'A3' },
  { source: 'SAHIBINDEN_HTML', make: 'Audi', family: 'A4' },
  { source: 'SAHIBINDEN_HTML', make: 'BMW', family: '3 Serisi' },
];

describe('market-refresh job queue', () => {
  it('builds broad make/family jobs with stable ids and no duplicates', () => {
    const jobs = createJobs([...specs, specs[0]]);
    expect(jobs).toHaveLength(3);
    expect(jobs.map((j) => j.id)).toEqual([
      'sahibinden_html:audi:a3',
      'sahibinden_html:audi:a4',
      'sahibinden_html:bmw:3-serisi',
    ]);
    expect(jobs.every((j) => j.status === 'PENDING' && j.cursor.page === 1)).toBe(true);
  });

  it('refuses wizard-leaf granularity instead of silently accepting it', () => {
    const tooMany = Array.from({ length: MAX_JOBS_V1 + 1 }, (_v, i) => ({
      source: 'SAHIBINDEN_HTML',
      make: 'Audi',
      family: `leaf-${i}`,
    }));
    expect(() => createJobs(tooMany)).toThrow(JobGranularityError);
  });

  it('prefers a half-finished job over starting a new one', () => {
    const queue = new JobQueue(createJobs(specs));
    queue.start('sahibinden_html:audi:a3');
    queue.advance('sahibinden_html:audi:a3', 1, 20);
    expect(queue.next()!.id).toBe('sahibinden_html:audi:a3');

    queue.complete('sahibinden_html:audi:a3');
    expect(queue.next()!.id).toBe('sahibinden_html:audi:a4');
  });

  it('advances the cursor past the completed page so work is never repeated', () => {
    const queue = new JobQueue(createJobs(specs));
    queue.start('sahibinden_html:audi:a3');
    queue.advance('sahibinden_html:audi:a3', 4, 10);
    expect(queue.get('sahibinden_html:audi:a3')!.cursor.page).toBe(5);
    expect(queue.get('sahibinden_html:audi:a3')!.observedCount).toBe(10);
  });

  it('tracks blocked and failed jobs separately from pending work', () => {
    const queue = new JobQueue(createJobs(specs));
    queue.start('sahibinden_html:audi:a3');
    queue.block('sahibinden_html:audi:a3', 'HTTP_429 on page 2');
    queue.start('sahibinden_html:audi:a4');
    queue.fail('sahibinden_html:audi:a4', 'timeout');

    const counts = queue.countByStatus();
    expect(counts.BLOCKED).toBe(1);
    expect(counts.FAILED).toBe(1);
    expect(counts.PENDING).toBe(1);
    // Bloke is yeniden secilmez.
    expect(queue.next()!.id).toBe('sahibinden_html:bmw:3-serisi');
  });
});
