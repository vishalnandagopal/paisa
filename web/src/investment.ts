import * as d3 from "d3";
import legend from "d3-svg-legend";
import dayjs from "dayjs";
import _ from "lodash";
import {
  ajax,
  forEachMonth,
  formatCurrency,
  formatCurrencyCrude,
  Posting,
  secondName,
  skipTicks,
  tooltip,
  YearlyCard
} from "./utils";

export default async function () {
  const { postings: postings, yearly_cards: yearlyCards } = await ajax(
    "/api/investment"
  );
  _.each(postings, (p) => (p.timestamp = dayjs(p.date)));
  _.each(yearlyCards, (c) => {
    c.start_date_timestamp = dayjs(c.start_date);
    c.end_date_timestamp = dayjs(c.end_date);
  });
  renderMonthlyInvestmentTimeline(postings);
  renderYearlyInvestmentTimeline(yearlyCards);
}

function renderMonthlyInvestmentTimeline(postings: Posting[]) {
  const id = "#d3-investment-timeline";
  const timeFormat = "MMM-YYYY";
  const MAX_BAR_WIDTH = 40;
  const svg = d3.select(id),
    margin = { top: 40, right: 30, bottom: 60, left: 40 },
    width =
      document.getElementById(id.substring(1)).parentElement.clientWidth -
      margin.left -
      margin.right,
    height = +svg.attr("height") - margin.top - margin.bottom,
    g = svg
      .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  const groups = _.chain(postings)
    .map((p) => secondName(p.account))
    .uniq()
    .sort()
    .value();
  const groupKeys = _.flatMap(groups, (g) => [g + "-credit", g + "-debit"]);

  const defaultValues = _.zipObject(
    groupKeys,
    _.map(groupKeys, () => 0)
  );

  const start = _.min(_.map(postings, (p) => p.timestamp)),
    end = dayjs().startOf("month");
  const ts = _.groupBy(postings, (p) => p.timestamp.format(timeFormat));

  const points: {
    month: string;
    [key: string]: number | string | dayjs.Dayjs;
  }[] = [];

  forEachMonth(start, end, (month) => {
    const postings = ts[month.format(timeFormat)] || [];
    const values = _.chain(postings)
      .groupBy((t) => secondName(t.account))
      .flatMap((postings, key) => [
        [
          key + "-credit",
          _.sum(
            _.filter(
              _.map(postings, (p) => p.amount),
              (a) => a >= 0
            )
          )
        ],
        [
          key + "-debit",
          _.sum(
            _.filter(
              _.map(postings, (p) => p.amount),
              (a) => a < 0
            )
          )
        ]
      ])
      .fromPairs()
      .value();

    points.push(
      _.merge(
        {
          month: month.format(timeFormat),
          postings: postings
        },
        defaultValues,
        values
      )
    );
  });

  const x = d3.scaleBand().range([0, width]).paddingInner(0.1).paddingOuter(0);
  const y = d3.scaleLinear().range([height, 0]);

  const sum = (filter) => (p) =>
    _.sum(
      _.filter(
        _.map(groupKeys, (k) => p[k]),
        filter
      )
    );
  x.domain(points.map((p) => p.month));
  y.domain([
    d3.min(
      points,
      sum((a) => a < 0)
    ),
    d3.max(
      points,
      sum((a) => a > 0)
    )
  ]);

  const z = d3.scaleOrdinal<string>().range(d3.schemeCategory10);

  g.append("g")
    .attr("class", "axis x")
    .attr("transform", "translate(0," + height + ")")
    .call(
      d3
        .axisBottom(x)
        .ticks(5)
        .tickFormat(skipTicks(30, x, (d) => d.toString(), points.length))
    )
    .selectAll("text")
    .attr("y", 10)
    .attr("x", -8)
    .attr("dy", ".35em")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end");

  g.append("g")
    .attr("class", "axis y")
    .call(d3.axisLeft(y).tickSize(-width).tickFormat(formatCurrencyCrude));

  g.append("g")
    .selectAll("g")
    .data(
      d3.stack().offset(d3.stackOffsetDiverging).keys(groupKeys)(
        points as { [key: string]: number }[]
      )
    )
    .enter()
    .append("g")
    .attr("fill", function (d) {
      return z(d.key.split("-")[0]);
    })
    .selectAll("rect")
    .data(function (d) {
      return d;
    })
    .enter()
    .append("rect")
    .attr("data-tippy-content", (d) => {
      const postings: Posting[] = (d.data as any).postings;
      return tooltip(
        _.sortBy(
          postings.map((p) => [
            _.drop(p.account.split(":")).join(":"),
            [formatCurrency(p.amount), "has-text-weight-bold has-text-right"]
          ]),
          (r) => r[0]
        )
      );
    })
    .attr("x", function (d) {
      return (
        x((d.data as any).month) +
        (x.bandwidth() - Math.min(x.bandwidth(), MAX_BAR_WIDTH)) / 2
      );
    })
    .attr("y", function (d) {
      return y(d[1]);
    })
    .attr("height", function (d) {
      return y(d[0]) - y(d[1]);
    })
    .attr("width", Math.min(x.bandwidth(), MAX_BAR_WIDTH));

  svg
    .append("g")
    .attr("class", "legendOrdinal")
    .attr("transform", "translate(40,0)");

  const legendOrdinal = legend
    .legendColor()
    .shape("rect")
    .orient("horizontal")
    .shapePadding(100)
    .labels(groups)
    .scale(z);

  svg.select(".legendOrdinal").call(legendOrdinal as any);
}

function renderYearlyInvestmentTimeline(yearlyCards: YearlyCard[]) {
  const id = "#d3-yearly-investment-timeline";
  const BAR_HEIGHT = 20;
  const svg = d3.select(id),
    margin = { top: 40, right: 20, bottom: 20, left: 80 },
    width =
      document.getElementById(id.substring(1)).parentElement.clientWidth -
      margin.left -
      margin.right,
    g = svg
      .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  const groups = _.chain(yearlyCards)
    .flatMap((c) => c.postings)
    .map((p) => secondName(p.account))
    .uniq()
    .sort()
    .value();
  const groupKeys = _.flatMap(groups, (g) => [g + "-credit", g + "-debit"]);

  const defaultValues = _.zipObject(
    groupKeys,
    _.map(groupKeys, () => 0)
  );

  const start = _.min(_.map(yearlyCards, (c) => c.start_date_timestamp)),
    end = _.max(_.map(yearlyCards, (c) => c.end_date_timestamp));

  const height = BAR_HEIGHT * (end.year() - start.year());
  svg.attr("height", height + margin.top + margin.bottom);

  const points: {
    year: string;
    [key: string]: number | string | dayjs.Dayjs;
  }[] = [];

  _.each(yearlyCards, (card) => {
    const postings = card.postings;
    const values = _.chain(postings)
      .groupBy((t) => secondName(t.account))
      .flatMap((postings, key) => [
        [
          key + "-credit",
          _.sum(
            _.filter(
              _.map(postings, (p) => p.amount),
              (a) => a >= 0
            )
          )
        ],
        [
          key + "-debit",
          _.sum(
            _.filter(
              _.map(postings, (p) => p.amount),
              (a) => a < 0
            )
          )
        ]
      ])
      .fromPairs()
      .value();

    points.push(
      _.merge(
        {
          year: `${card.start_date_timestamp.format(
            "YYYY"
          )}-${card.end_date_timestamp.format("YYYY")}`,
          postings: postings
        },
        defaultValues,
        values
      )
    );
  });

  const x = d3.scaleLinear().range([0, width]);
  const y = d3.scaleBand().range([height, 0]).paddingInner(0.1).paddingOuter(0);

  const sum = (filter) => (p) =>
    _.sum(
      _.filter(
        _.map(groupKeys, (k) => p[k]),
        filter
      )
    );
  y.domain(points.map((p) => p.year));
  x.domain([
    d3.min(
      points,
      sum((a) => a < 0)
    ),
    d3.max(
      points,
      sum((a) => a > 0)
    )
  ]);

  const z = d3.scaleOrdinal<string>().range(d3.schemeCategory10);

  g.append("g")
    .attr("class", "axis y")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x).tickSize(-height).tickFormat(formatCurrencyCrude));

  g.append("g").attr("class", "axis y dark").call(d3.axisLeft(y));

  g.append("g")
    .selectAll("g")
    .data(
      d3.stack().offset(d3.stackOffsetDiverging).keys(groupKeys)(
        points as { [key: string]: number }[]
      )
    )
    .enter()
    .append("g")
    .attr("fill", function (d) {
      return z(d.key.split("-")[0]);
    })
    .selectAll("rect")
    .data(function (d) {
      return d;
    })
    .enter()
    .append("rect")
    .attr("data-tippy-content", (d) => {
      return tooltip(
        _.sortBy(
          groupKeys.flatMap((k) => {
            const total = d.data[k];
            if (total == 0) {
              return [];
            }
            return [
              [
                k.replace("-credit", "").replace("-debit", ""),
                [
                  formatCurrency(d.data[k]),
                  "has-text-weight-bold has-text-right"
                ]
              ]
            ];
          }),
          (r) => r[0]
        )
      );
    })
    .attr("x", function (d) {
      return x(d[0]);
    })
    .attr("y", function (d) {
      return (
        y((d.data as any).year) +
        (y.bandwidth() - Math.min(y.bandwidth(), BAR_HEIGHT)) / 2
      );
    })
    .attr("width", function (d) {
      return x(d[1]) - x(d[0]);
    })
    .attr("height", y.bandwidth());

  svg
    .append("g")
    .attr("class", "legendOrdinal")
    .attr("transform", "translate(40,0)");

  const legendOrdinal = legend
    .legendColor()
    .shape("rect")
    .orient("horizontal")
    .shapePadding(100)
    .labels(groups)
    .scale(z);

  svg.select(".legendOrdinal").call(legendOrdinal as any);
}
