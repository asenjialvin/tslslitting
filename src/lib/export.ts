import ExcelJS from "exceljs";

export interface PlanLineExport {
  sequence: number;
  coilThicknessMm: number;
  coilWidthMm: number;
  noOfCoils: number;
  segments: { slitWidthMm: number; slitCount: number; productLabel: string }[];
  totalWidthMm: number;
  scrapMm: number;
}

function fmtThickness(th: number): string {
  return Number.isInteger(th) ? th.toFixed(1) : String(th);
}

const MAX_SEGMENTS = 6; // covers the largest combos seen in historical + curated data
const TIGHT_SCRAP_THRESHOLD_MM = 15; // highlight rows that waste very little material

export async function exportPlanToXlsx(
  planNumber: string,
  lines: PlanLineExport[],
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(planNumber);

  const headerFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F3A4D" }, // matches --primary (dark steel navy)
  };
  const grey: ExcelJS.Border = { style: "thin", color: { argb: "FFD9D9D9" } };
  const red: ExcelJS.Border = { style: "thin", color: { argb: "FFC2483F" } }; // --accent divider
  const tightScrapFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2EFDA" }, // light functional green, matches --success family
  };
  const snCol = 1;
  const coilCol = 2;
  const coilsCol = 3;
  const firstSegCol = 4;
  const totalCol = firstSegCol + MAX_SEGMENTS;
  const scrapCol = totalCol + 1;
  const totalCols = scrapCol;

  // ---- header (2 rows tall, merged) ----
  ws.mergeCells(1, snCol, 2, snCol);
  ws.mergeCells(1, coilCol, 2, coilCol);
  ws.mergeCells(1, coilsCol, 2, coilsCol);
  ws.mergeCells(1, firstSegCol, 1, firstSegCol + MAX_SEGMENTS - 1);
  ws.mergeCells(1, totalCol, 2, totalCol);
  ws.mergeCells(1, scrapCol, 2, scrapCol);

  const headerVals: [number, number, string][] = [
    [1, snCol, "S/N"],
    [1, coilCol, "Coil Size"],
    [1, coilsCol, "No. of Coils"],
    [1, firstSegCol, "Slit Combination"],
    [1, totalCol, "Total Width"],
    [1, scrapCol, "Scrap"],
  ];
  for (const [r, c, val] of headerVals) {
    const cell = ws.getCell(r, c);
    cell.value = val;
    cell.font = { name: "Inter", bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }
  for (let c = 1; c <= totalCols; c++) {
    ws.getCell(1, c).fill = headerFill;
    ws.getCell(2, c).fill = headerFill;
    ws.getRow(1).height = 26;
  }

  let row = 3;
  for (const line of lines) {
    ws.mergeCells(row, snCol, row + 1, snCol);
    const snCell = ws.getCell(row, snCol);
    snCell.value = line.sequence;
    snCell.font = { name: "JetBrains Mono", bold: true };
    snCell.alignment = { horizontal: "center", vertical: "middle" };
    snCell.border = { top: grey, bottom: grey, left: grey, right: grey };

    ws.mergeCells(row, coilCol, row + 1, coilCol);
    const coilCell = ws.getCell(row, coilCol);
    coilCell.value = `${fmtThickness(line.coilThicknessMm)} X ${line.coilWidthMm}`;
    coilCell.font = { name: "JetBrains Mono", bold: true };
    coilCell.alignment = { horizontal: "center", vertical: "middle" };
    coilCell.border = { top: grey, bottom: grey, left: grey, right: grey };

    ws.mergeCells(row, coilsCol, row + 1, coilsCol);
    const coilsCell = ws.getCell(row, coilsCol);
    coilsCell.value = `${line.noOfCoils} Coils`;
    coilsCell.alignment = { horizontal: "center", vertical: "middle" };
    coilsCell.border = { top: grey, bottom: grey, left: grey, right: grey };

    for (let i = 0; i < MAX_SEGMENTS; i++) {
      const col = firstSegCol + i;
      const numCell = ws.getCell(row, col);
      const denCell = ws.getCell(row + 1, col);
      if (i < line.segments.length) {
        const seg = line.segments[i];
        numCell.value = `(${seg.slitWidthMm} X ${seg.slitCount})`;
        numCell.font = { name: "JetBrains Mono", size: 10 };
        numCell.alignment = { horizontal: "center" };
        numCell.border = { top: grey, left: grey, right: grey, bottom: red };

        denCell.value = seg.productLabel;
        denCell.font = { name: "Inter", bold: true, size: 10 };
        denCell.alignment = { horizontal: "center" };
        denCell.border = { bottom: grey, left: grey, right: grey };
      } else {
        numCell.border = { top: grey, left: grey, right: grey, bottom: grey };
        denCell.border = { bottom: grey, left: grey, right: grey };
      }
    }

    ws.mergeCells(row, totalCol, row + 1, totalCol);
    const totalCell = ws.getCell(row, totalCol);
    totalCell.value = line.totalWidthMm;
    totalCell.font = { name: "JetBrains Mono" };
    totalCell.alignment = { horizontal: "center", vertical: "middle" };
    totalCell.border = { top: grey, bottom: grey, left: grey, right: grey };

    ws.mergeCells(row, scrapCol, row + 1, scrapCol);
    const scrapCell = ws.getCell(row, scrapCol);
    scrapCell.value = line.scrapMm;
    scrapCell.font = { name: "JetBrains Mono" };
    scrapCell.alignment = { horizontal: "center", vertical: "middle" };
    scrapCell.border = { top: grey, bottom: grey, left: grey, right: grey };
    // Highlight tight-scrap rows (efficient cuts), same idea as the Gemini draft.
    if (line.scrapMm <= TIGHT_SCRAP_THRESHOLD_MM) {
      scrapCell.fill = tightScrapFill;
      scrapCell.font = { name: "JetBrains Mono", bold: true, color: { argb: "FF375623" } };
    }

    row += 2;
  }

  ws.getColumn(snCol).width = 6;
  ws.getColumn(coilCol).width = 16;
  ws.getColumn(coilsCol).width = 12;
  for (let i = 0; i < MAX_SEGMENTS; i++) ws.getColumn(firstSegCol + i).width = 13;
  ws.getColumn(totalCol).width = 12;
  ws.getColumn(scrapCol).width = 10;

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
