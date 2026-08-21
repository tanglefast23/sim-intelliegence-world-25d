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
      // Union of both branches' grants, including the textured office-chair cell.
      cellCount: 801,
      rawRectangleArea: 776_108,
      width: 1024,
    });
    expect(report.forecast.height).toBeLessThanOrEqual(1024);
    expect(report.forecast.rawAreaRatio).toBeLessThanOrEqual(manifest.limits.maximumRawAreaRatio);
    expect(report.forecast.packedAreaRatio).toBeLessThanOrEqual(0.8);
  });

  test('the eye-band category fits inside the atlas forecast', () => {
    const manifest = loadArtManifest();
    const report = createAtlasBudgetReport([], manifest);
    // 36 cells of 24x3 with a 1px gutter each side: 36 * 26 * 5 = 4680.
    expect(manifest.categories['world-character-eyes']).toEqual({
      maximumCount: 36,
      width: 24,
      height: 3,
    });
    // The assertion's point survives the merge: the blink category costs exactly 4_680.
    expect(report.forecast.rawRectangleArea - 771_428).toBe(4_680);
    expect(report.forecast.rawAreaRatio).toBeLessThan(0.75);
    expect(report.forecast.packedAreaRatio).toBeLessThan(0.8);
  });

  test('reports actual category counts without changing the fixed ceiling forecast', () => {
    const manifest = loadArtManifest();
    const cells: BudgetCell[] = [{ id: 'tile.warm-sand', category: 'ground-base', width: 32, height: 32 }];
    const report = createAtlasBudgetReport(cells, manifest);
    expect(report.categories['ground-base']).toMatchObject({ actualCount: 1, maximumCount: 96 });
    expect(report.forecast.rawRectangleArea).toBe(776_108);
  });

  test('stops a category overrun with the required reduction action', () => {
    const manifest = loadArtManifest();
    const cells = fullBudgetCells();
    cells.push({ id: 'extra-ground', category: 'ground-base', width: 32, height: 32 });
    expect(() => createAtlasBudgetReport(cells, manifest)).toThrow('reduce it to 96 or fewer');
  });
});
