// ========================== COMPARE PAGE FUNCTIONS ==========================

// Metric groups for validation (only metrics in same group can be compared)
const COMPARE_METRIC_GROUPS = {
  'distance|time|elevation': {
    name: 'Distance & Time',
    metrics: { distance: 'km', time: 'hours', elevation: 'm' }
  },
  'power': {
    name: 'Power & Efficiency',
    metrics: { power: 'watts' }
  },
  'fitness|tss': {
    name: 'Training Load',
    metrics: { tss: 'points', ctl: 'points', atl: 'points', tsb: 'points' }
  },
  'count': {
    name: 'Activity',
    metrics: { count: 'rides' }
  }
};

// Compare page state
const _compare = {
  startDate: null,
  endDate: null,
  periodDays: 28,
  grouping: 'week',  // week, biweek, month
  chartType: 'bar',  // bar or line
  yearOverYear: false,
  metric1: 'tss',
  metric2: '',
  metric3: '',
  chart: null
};

function getMetricGroup(metricKey) {
  for (const [keys, group] of Object.entries(COMPARE_METRIC_GROUPS)) {
    if (keys.split('|').includes(metricKey)) return group;
  }
  return null;
}

function validateMetricsGroup(m1, m2, m3) {
  const metrics = [m1, m2, m3].filter(m => m);
  if (metrics.length <= 1) return true;
  const groups = metrics.map(m => getMetricGroup(m));
  return groups.every(g => g && g === groups[0]);
}

function buildMetricDropdown(baseMetricKey) {
  const baseGroup = getMetricGroup(baseMetricKey);
  if (!baseGroup) return;

  const m2Select = document.getElementById('compareMetric2');
  const m3Select = document.getElementById('compareMetric3');

  // Clear both
  m2Select.innerHTML = '<option value="">None</option>';
  m3Select.innerHTML = '<option value="">None</option>';

  // Add metrics from same group
  for (const [metricKey, unit] of Object.entries(baseGroup.metrics)) {
    if (metricKey !== baseMetricKey) {
      const label = `${metricKey.replace(/_/g, ' ').toUpperCase()} (${unit})`;
      const opt2 = document.createElement('option');
      opt2.value = metricKey;
      opt2.textContent = label;
      m2Select.appendChild(opt2);

      const opt3 = document.createElement('option');
      opt3.value = metricKey;
      opt3.textContent = label;
      m3Select.appendChild(opt3);
    }
  }
}

function setComparePeriod(days) {
  _compare.periodDays = days;
  _compare.startDate = null;
  _compare.endDate = null;
  document.querySelectorAll('.compare-range-pills button').forEach(b => b.classList.remove('active'));
  event?.target?.classList.add('active');
  updateComparePage();
}

function setCompareChartType(type) {
  _compare.chartType = type;
  document.getElementById('compareBarBtn').classList.toggle('active', type === 'bar');
  document.getElementById('compareLineBtn').classList.toggle('active', type === 'line');
  updateComparePage();
}

function openCustomDatePicker() {
  const modal = document.getElementById('compareDateModal');
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 28);

  document.getElementById('compareStartDate').valueAsDate = startDate;
  document.getElementById('compareEndDate').valueAsDate = today;

  modal.style.display = 'flex';
}

function closeCustomDatePicker() {
  document.getElementById('compareDateModal').style.display = 'none';
}

function applyCustomDateRange() {
  const startStr = document.getElementById('compareStartDate').value;
  const endStr = document.getElementById('compareEndDate').value;

  if (!startStr || !endStr) {
    alert('Please select both start and end dates');
    return;
  }

  _compare.startDate = new Date(startStr);
  _compare.endDate = new Date(endStr);
  _compare.periodDays = null;

  // Clear active pills
  document.querySelectorAll('.compare-range-pills button').forEach(b => b.classList.remove('active'));

  closeCustomDatePicker();
  updateComparePage();
}

function aggregateDataForComparison(startDate, endDate, grouping, includeYoY) {
  const periods = [];
  let current = new Date(startDate);

  // Generate periods
  while (current < endDate) {
    const periodStart = new Date(current);
    let periodEnd;

    if (grouping === 'week') {
      periodEnd = new Date(current);
      periodEnd.setDate(periodEnd.getDate() + 7);
    } else if (grouping === 'biweek') {
      periodEnd = new Date(current);
      periodEnd.setDate(periodEnd.getDate() + 14);
    } else { // month
      periodEnd = new Date(current);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    periodEnd = new Date(Math.min(periodEnd.getTime(), endDate.getTime()));
    periods.push({
      label: `${toDateStr(periodStart).slice(5)}`,
      startDate: periodStart,
      endDate: periodEnd,
      data: {}
    });

    current = new Date(periodEnd);
  }

  // Aggregate metrics for each period
  for (const period of periods) {
    const startStr = toDateStr(period.startDate);
    const endStr = toDateStr(period.endDate);

    let tss = 0, dist = 0, time = 0, elev = 0, pow = 0, powN = 0, count = 0;

    for (const activity of state.activities) {
      const actDate = (activity.start_date_local || activity.start_date || '').slice(0, 10);
      if (actDate < startStr || actDate >= endStr) continue;
      if (isEmptyActivity(activity)) continue;

      count++;
      tss += actVal(activity, 'icu_training_load', 'tss');
      dist += actVal(activity, 'distance', 'icu_distance') / 1000;
      time += actVal(activity, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time') / 3600;
      elev += actVal(activity, 'total_elevation_gain', 'icu_total_elevation_gain');
      const w = actVal(activity, 'icu_weighted_avg_watts', 'average_watts', 'icu_average_watts');
      if (w > 0) { pow += w; powN++; }
    }

    period.data = {
      tss: Math.round(tss),
      distance: parseFloat(dist.toFixed(1)),
      time: parseFloat(time.toFixed(1)),
      elevation: Math.round(elev),
      power: powN > 0 ? Math.round(pow / powN) : 0,
      count: count
    };
  }

  return periods;
}

function generateCompareChart(periods, metrics, chartType) {
  const canvas = document.getElementById('compareChart');
  if (!canvas) return;

  _compare.chart = destroyChart(_compare.chart);
  const ctx = canvas.getContext('2d');

  const colors = [
    { r: 0, g: 229, b: 160 },    // accent green
    { r: 74, g: 158, b: 255 },   // blue
    { r: 255, g: 107, b: 53 }    // orange
  ];

  const datasets = metrics.map((metric, idx) => {
    const values = periods.map(p => p.data[metric] || 0);
    const color = colors[idx];
    return {
      label: metric.toUpperCase(),
      data: values,
      borderColor: `rgb(${color.r},${color.g},${color.b})`,
      backgroundColor: `rgba(${color.r},${color.g},${color.b},0.1)`,
      tension: 0.3,
      borderWidth: 2,
      fill: chartType === 'line' ? false : true,
      pointRadius: chartType === 'line' ? 4 : 0,
      pointBackgroundColor: `rgb(${color.r},${color.g},${color.b})`
    };
  });

  const config = {
    type: chartType === 'bar' ? 'bar' : 'line',
    data: {
      labels: periods.map(p => p.label),
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: 'var(--text-secondary)', font: { size: 12 } } },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.7)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'var(--border)',
          borderWidth: 1,
          padding: 10,
          titleFont: { size: 12, weight: 'bold' },
          bodyFont: { size: 12 }
        }
      },
      scales: {
        y: {
          ticks: { color: 'var(--text-secondary)', font: { size: 11 } },
          grid: { color: 'var(--border)', drawBorder: false },
          beginAtZero: true
        },
        x: {
          ticks: { color: 'var(--text-secondary)', font: { size: 11 } },
          grid: { display: false }
        }
      }
    }
  };

  _compare.chart = new Chart(ctx, config);
}

function generateCompareStats(periods, metrics) {
  let html = '<table><thead><tr><th>Metric</th>';

  for (const period of periods) {
    html += `<th>${period.label}</th>`;
  }
  html += '<th>Min</th><th>Max</th><th>Avg</th><th>Change</th></tr></thead><tbody>';

  for (const metric of metrics) {
    const values = periods.map(p => p.data[metric] || 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
    const change = values[0] > 0 ? (((values[values.length - 1] - values[0]) / values[0]) * 100).toFixed(1) : 0;
    const changeClass = change > 0 ? 'stat-positive' : (change < 0 ? 'stat-negative' : '');

    html += `<tr><td>${metric.toUpperCase()}</td>`;
    for (const val of values) {
      html += `<td>${val}</td>`;
    }
    html += `<td>${min}</td><td>${max}</td><td>${avg}</td><td class="${changeClass}">${change > 0 ? '+' : ''}${change}%</td></tr>`;
  }

  html += '</tbody></table>';
  document.getElementById('compareStatsTable').innerHTML = html;
}

function renderComparePage() {
  const m1 = document.getElementById('compareMetric1')?.value || 'tss';
  _compare.metric1 = m1;
  _compare.metric2 = document.getElementById('compareMetric2')?.value || '';
  _compare.metric3 = document.getElementById('compareMetric3')?.value || '';
  _compare.grouping = document.getElementById('compareGrouping')?.value || 'week';
  _compare.yearOverYear = document.getElementById('compareYoY')?.checked || false;

  buildMetricDropdown(m1);
  updateComparePage();
}

function updateComparePage() {
  const metrics = [_compare.metric1, _compare.metric2, _compare.metric3].filter(m => m);

  if (!validateMetricsGroup(...metrics)) {
    alert('Can only compare metrics from the same group. Please select metrics with compatible units.');
    return;
  }

  // Determine date range
  let startDate, endDate;
  if (_compare.startDate && _compare.endDate) {
    startDate = _compare.startDate;
    endDate = _compare.endDate;
  } else {
    endDate = new Date();
    startDate = daysAgo(_compare.periodDays);
  }

  // Aggregate data
  const periods = aggregateDataForComparison(startDate, endDate, _compare.grouping, _compare.yearOverYear);

  if (periods.length === 0) {
    document.getElementById('compareEmptyState').style.display = 'block';
    document.getElementById('compareChartCard').style.display = 'none';
    document.getElementById('compareStatsCard').style.display = 'none';
    document.getElementById('compareInsights').style.display = 'none';
    return;
  }

  // Show/hide cards
  document.getElementById('compareEmptyState').style.display = 'none';
  document.getElementById('compareChartCard').style.display = '';
  document.getElementById('compareStatsCard').style.display = '';
  document.getElementById('compareInsights').style.display = '';

  // Update subtitle
  const startStr = toDateStr(startDate);
  const endStr = toDateStr(endDate);
  document.getElementById('compareChartSubtitle').textContent = `${startStr} to ${endStr} · ${_compare.grouping}`;

  // Generate chart
  generateCompareChart(periods, metrics, _compare.chartType);

  // Generate stats
  generateCompareStats(periods, metrics);

  // Generate insights (simple version)
  const metricLabel = metrics.map(m => m.toUpperCase()).join(', ');
  const insightsHtml = `
    <div class="compare-insight-item positive">
      Comparing <strong>${metricLabel}</strong> across ${periods.length} ${_compare.grouping} periods
    </div>
  `;
  document.getElementById('compareInsightsList').innerHTML = insightsHtml;
}
