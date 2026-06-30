// -----------------------------------------------
// Export Utilities: CSV, PNG, PDF
// -----------------------------------------------
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// -----------------------------------------------
// Types
// -----------------------------------------------
export interface TableRow {
  name: string;
  vOn: string;
  n: string;
  I_sat: string;
  bandgap: string;
  rs: string;
  vbr: string;
}

// -----------------------------------------------
// -----------------------------------------------
// 1. Export CSV
// -----------------------------------------------
export function exportCSV(
  tableRows: TableRow[],
  analysisMode: string,
  chartData: any[] = [],
  activeCurves: any[] = [],
  isLogAxis = false
): void {
  const csvLines: string[] = [];

  // Title / Section 1: Summary Parameters
  csvLines.push(`"IV CURVE ANALYSER - EXTRACTED DEVICE PARAMETERS"`);
  csvLines.push(`"Analysis Mode: ${analysisMode}"`);
  csvLines.push(`"Exported: ${new Date().toLocaleString()}"`);
  csvLines.push(''); // blank line

  const headers = [
    'Material/Condition',
    'Turn-on Voltage',
    'Ideality Factor',
    'Sat. Current',
    'Bandgap',
    'Series Res.',
    'Breakdown Vbr'
  ];
  csvLines.push(headers.map(h => `"${h}"`).join(','));

  tableRows.forEach(row => {
    // Sanitize ohms symbol to prevent character encoding issues in Excel
    const sanitize = (val: string) => val.replace(/\u03a9/g, 'Ohm');
    const line = [
      `"${row.name}"`,
      `"${row.vOn}"`,
      `"${row.n}"`,
      `"${row.I_sat}"`,
      `"${row.bandgap}"`,
      `"${sanitize(row.rs)}"`,
      `"${row.vbr}"`
    ].join(',');
    csvLines.push(line);
  });

  // Section 2: Raw Simulation Curve Data
  if (chartData && chartData.length > 0) {
    csvLines.push('');
    csvLines.push('');
    csvLines.push(`"IV CURVE ANALYSER - RAW SIMULATION DATA POINTS"`);
    
    // Build headers for columns
    const dataHeaders = ['"Voltage (V)"'];
    activeCurves.forEach(c => {
      const unit = isLogAxis ? 'A' : 'mA';
      dataHeaders.push(`"Current - ${c.name} (${unit})"`);
    });

    // Check if CSV overlay exists in data keys
    const firstPoint = chartData[0];
    const hasCsv = 'I_csv' in firstPoint || 'absI_csv' in firstPoint;
    if (hasCsv) {
      const unit = isLogAxis ? 'A' : 'mA';
      dataHeaders.push(`"Current - CSV Overlay (${unit})"`);
    }

    csvLines.push(dataHeaders.join(','));

    // Populate data rows
    chartData.forEach(pt => {
      const rowVals: any[] = [pt.V.toFixed(4)];
      activeCurves.forEach((_, idx) => {
        const valKey = isLogAxis ? `absI_${idx}` : `I_${idx}`;
        const val = pt[valKey];
        rowVals.push(val !== undefined ? val : '');
      });

      if (hasCsv) {
        const valKey = isLogAxis ? 'absI_csv' : 'I_csv';
        const val = pt[valKey];
        rowVals.push(val !== undefined ? val : '');
      }

      csvLines.push(rowVals.join(','));
    });
  }

  // Prepend UTF-8 BOM so Excel opens it with correct encoding automatically
  const csvContent = '\uFEFF' + csvLines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  link.download = `IV_Curve_Data_${analysisMode.replace(/\s+/g, '_')}_${timestamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// -----------------------------------------------
// 2. Save Plot Image (PNG)
// -----------------------------------------------
export async function savePlotImage(chartContainerSelector: string): Promise<void> {
  const chartEl = document.querySelector(chartContainerSelector) as HTMLElement | null;
  if (!chartEl) {
    alert('Chart not found. Please run an analysis first.');
    return;
  }

  try {
    const canvas = await html2canvas(chartEl, {
      backgroundColor: '#0b0b14',
      scale: 3, // High-res export
      useCORS: true,
      logging: false,
    });

    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    link.download = `IV_Curve_Plot_${timestamp}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Save Plot Image error:', err);
    alert('Failed to save plot image. Check the console for details.');
  }
}

// -----------------------------------------------
// 3. Export PDF (Academic A4 White Layout)
// -----------------------------------------------
export async function exportPDF(
  chartContainerSelector: string,
  tableRows: TableRow[],
  analysisMode: string,
  materials: string[],
  temperature: number,
  seriesRes: number,
  vbr: number
): Promise<void> {
  const chartEl = document.querySelector(chartContainerSelector) as HTMLElement | null;
  if (!chartEl) {
    alert('Chart not found. Please run an analysis first.');
    return;
  }

  try {
    // 1. Capture chart as high-res image
    const canvas = await html2canvas(chartEl, {
      backgroundColor: '#ffffff',
      scale: 3,
      useCORS: true,
      logging: false,
      onclone: (clonedDoc: Document) => {
        // Force the cloned chart to use white/light styling for a clean academic look
        const clonedChart = clonedDoc.querySelector(chartContainerSelector) as HTMLElement;
        if (clonedChart) {
          clonedChart.style.backgroundColor = '#ffffff';

          // Override dark HTML text colors (chart title, legend labels)
          const allHtmlText = clonedChart.querySelectorAll('h3, span, div, p');
          allHtmlText.forEach(el => {
            const htmlEl = el as HTMLElement;
            const color = getComputedStyle(htmlEl).color;
            // If text is light/white (for dark mode), force it dark
            if (color.includes('241') || color.includes('245') || color.includes('249') || color.includes('255') || color.includes('138')) {
              htmlEl.style.color = '#1e293b'; // slate-800
            }
          });

          // Override dark text colors inside SVG
          const allText = clonedChart.querySelectorAll('text');
          allText.forEach(t => {
            const fill = t.getAttribute('fill');
            if (fill && (fill.includes('#8a') || fill.includes('#f1') || fill.includes('var'))) {
              t.setAttribute('fill', '#334155'); // slate-700
            }
          });
          // Override grid lines
          const gridLines = clonedChart.querySelectorAll('line[stroke]');
          gridLines.forEach(l => {
            const stroke = l.getAttribute('stroke');
            if (stroke && (stroke.includes('#28') || stroke.includes('var'))) {
              l.setAttribute('stroke', '#e2e8f0');
            }
          });
        }
      }
    });

    const chartImgData = canvas.toDataURL('image/png');

    // 2. Create PDF (A4 portrait: 210 x 297 mm)
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageW = 210;
    const pageH = 297;
    const margin = 15;
    const contentW = pageW - 2 * margin;
    let yPos = margin;

    // --- HEADER ---
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.setTextColor(30, 41, 59); // slate-800
    pdf.text('Semiconductor IV Curve Analysis Report', margin, yPos + 6);
    yPos += 12;

    // Divider
    pdf.setDrawColor(100, 116, 139); // slate-500
    pdf.setLineWidth(0.5);
    pdf.line(margin, yPos, pageW - margin, yPos);
    yPos += 6;

    // --- METADATA (structured key-value layout) ---
    pdf.setFontSize(10);
    pdf.setTextColor(71, 85, 105); // slate-600

    const dateStr = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    // Each metadata row: label (bold) + value (normal)
    const metaEntries: Array<{ label: string; value: string }> = [
      { label: 'Analysis Mode:', value: analysisMode },
      { label: 'Material(s):', value: materials.join(', ') },
      { label: 'Temperature:', value: `${temperature} K` },
      { label: 'Series Resistance:', value: `${seriesRes.toFixed(1)} Ohm` },
      { label: 'Breakdown Voltage:', value: `${vbr.toFixed(1)} V` },
    ];

    metaEntries.forEach(entry => {
      pdf.setFont('helvetica', 'bold');
      pdf.text(entry.label, margin, yPos);
      const labelWidth = pdf.getTextWidth(entry.label);
      pdf.setFont('helvetica', 'normal');
      pdf.text(entry.value, margin + labelWidth + 2, yPos);
      yPos += 5;
    });
    yPos += 4;

    // --- CHART IMAGE ---
    const chartAspect = canvas.width / canvas.height;
    const chartW = contentW;
    const chartH = chartW / chartAspect;
    const maxChartH = 100; // cap height to leave room for table
    const finalChartH = Math.min(chartH, maxChartH);
    const finalChartW = finalChartH * chartAspect;
    const chartX = margin + (contentW - finalChartW) / 2; // center

    // Light border around chart
    pdf.setDrawColor(203, 213, 225); // slate-300
    pdf.setLineWidth(0.3);
    pdf.rect(chartX - 1, yPos - 1, finalChartW + 2, finalChartH + 2);

    pdf.addImage(chartImgData, 'PNG', chartX, yPos, finalChartW, finalChartH);
    yPos += finalChartH + 4;

    // Chart caption
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text('Figure 1: IV Characteristic Curve', pageW / 2, yPos, { align: 'center' });
    yPos += 8;

    // --- PARAMETERS TABLE ---
    // Table heading
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(30, 41, 59);
    pdf.text('Extracted Device Parameters', margin, yPos);
    yPos += 6;

    // Table setup
    const colHeaders = ['Material', 'Turn-on (V)', 'Ideality n', 'Sat. Current', 'Bandgap', 'Rs', 'Vbr'];
    const colCount = colHeaders.length;
    const colW = contentW / colCount;
    const rowH = 8;

    // Header row background
    pdf.setFillColor(241, 245, 249); // slate-100
    pdf.rect(margin, yPos, contentW, rowH, 'F');

    // Header row border
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.3);
    pdf.rect(margin, yPos, contentW, rowH);

    // Header text
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(71, 85, 105);
    colHeaders.forEach((header, i) => {
      pdf.text(header, margin + i * colW + colW / 2, yPos + 5.5, { align: 'center' });
    });
    yPos += rowH;

    // Data rows
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(30, 41, 59);

    tableRows.forEach((row, rowIdx) => {
      // Alternate row background
      if (rowIdx % 2 === 0) {
        pdf.setFillColor(248, 250, 252); // slate-50
        pdf.rect(margin, yPos, contentW, rowH, 'F');
      }

      // Row border
      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.15);
      pdf.rect(margin, yPos, contentW, rowH);

      // Sanitize Ω to Ohm for PDF font compatibility
      const sanitize = (s: string) => s.replace(/\u03a9/g, 'Ohm');
      const rowData = [row.name, row.vOn, row.n, row.I_sat, row.bandgap, sanitize(row.rs), row.vbr];
      rowData.forEach((cell, i) => {
        // Bold the material name column
        if (i === 0) {
          pdf.setFont('helvetica', 'bold');
        } else {
          pdf.setFont('helvetica', 'normal');
        }
        pdf.text(cell, margin + i * colW + colW / 2, yPos + 5.5, { align: 'center' });
      });
      yPos += rowH;
    });

    // Table caption
    yPos += 3;
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text('Table 1: Extracted parameters from IV characteristic analysis', pageW / 2, yPos, { align: 'center' });
    yPos += 10;

    // --- FOOTER ---
    pdf.setDrawColor(100, 116, 139);
    pdf.setLineWidth(0.3);
    const footerY = pageH - 12;
    pdf.line(margin, footerY, pageW - margin, footerY);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(148, 163, 184); // slate-400
    pdf.text('IV Analyser Web Suite v3.0 - Malik Mohamed', margin, footerY + 4);
    pdf.text(dateStr, pageW - margin, footerY + 4, { align: 'right' });

    // 3. Save
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    pdf.save(`IV_Analysis_Report_${timestamp}.pdf`);

  } catch (err) {
    console.error('Export PDF error:', err);
    alert('Failed to export PDF. Check the console for details.');
  }
}
