import { loadArtManifest } from '../art-manifest';
import { createAtlasBudgetReport, type BudgetCell } from '../atlas-budget';

function fullBudgetCells(): BudgetCell[] {
  const manifest = loadArtManifest();
  return Object.entries(manifest.categories).flatMap(([category, rule]) =>
    Array.from({ length: rule.maximumCount }, (_unused, index) => ({
      id: `${category}.${index}`,
      category: category as BudgetCell['category'],
      width: rule.width,
      height: rule.height,
    })),
  );
}

describe('atlas category and forecast budget', () => {
  test('runs all dimension-correct allowances through the real packer', () => {
    const manifest = loadArtManifest();
    const report = createAtlasBudgetReport([], manifest);
    expect(report.forecast).toMatchObject({
      cellCount: 753,
      rawRectangleArea: 761_198,
      width: 1024,
    });
    expect(report.forecast.height).toBeLessThanOrEqual(1024);
    expect(report.forecast.rawAreaRatio).toBeLessThanOrEqual(manifest.limits.maximumRawAreaRatio);
    expect(report.forecast.packedAreaRatio).toBeLessThanOrEqual(0.8);
  });

  test('reports actual category counts without changing the fixed ceiling forecast', () => {
    const manifest = loadArtManifest();
    const cells: BudgetCell[] = [{ id: 'tile.warm-sand', category: 'ground-base', width: 32, height: 32 }];
    const report = createAtlasBudgetReport(cells, manifest);
    expect(report.categories['ground-base']).toMatchObject({ actualCount: 1, maximumCount: 96 });
    expect(report.forecast.rawRectangleArea).toBe(761_198);
  });

  test('stops a category overrun with the required reduction action', () => {
    const manifest = loadArtManifest();
    const cells = fullBudgetCells();
    cells.push({ id: 'extra-ground', category: 'ground-base', width: 32, height: 32 });
    expect(() => createAtlasBudgetReport(cells, manifest)).toThrow('reduce it to 96 or fewer');
  });
});
