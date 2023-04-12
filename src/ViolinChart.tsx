// @ts-nocheck
import React from "react";
import * as d3 from "d3";

export interface ChartProps {
  data: [Date, number][],
  dimensions: { width: any, height: any, margin: any },
  xDomain: [Date, Date],
}

function getRandomSubarray(arr, size) {
  var shuffled = arr.slice(0), i = arr.length, temp, index;
  while (i--) {
      index = Math.floor((i + 1) * Math.random());
      temp = shuffled[index];
      shuffled[index] = shuffled[i];
      shuffled[i] = temp;
  }
  return shuffled.slice(0, size);
}

const ViolinChart = ({ data, dimensions }: ChartProps) => {  
  const setDay = (date: Date, day: number) => {
    let currentDay = date.getUTCDay();
    let distance = day - currentDay;
    date.setUTCDate(date.getUTCDate() + distance);
  };

  //data = data.slice(40000, undefined);
  data = data.filter(date => date[0].getFullYear() >= 2020);
  data = getRandomSubarray(data, 20000);
  data = data.map(d => [d[0], Math.log2(d[1] + 0.01)]);
  data = data.map(d => {
    const weekDay = new Date(d[0]);
    setDay(weekDay, 0);
    weekDay.setUTCHours(0);
    weekDay.setUTCMinutes(0);
    weekDay.setUTCSeconds(0);
    weekDay.setUTCMilliseconds(0);
    return [weekDay, d[1]];
  });

  const svgRef = React.useRef(null);
  const { width, height, margin } = dimensions;
  const svgWidth = width + margin.left + margin.right;
  const svgHeight = height + margin.top + margin.bottom;

  const maxDate = new Date(Math.max.apply(null, data.map(d => d[0])));
  const minDate = new Date(Math.min.apply(null, data.map(d => d[0])));

  const getWeeksArray = (start: Date, end: Date) => {
    setDay(start, 0);
    setDay(end, 6);
    start.setUTCHours(0);
    start.setUTCMinutes(0);
    start.setUTCSeconds(0);
    start.setUTCMilliseconds(0);
    let arr = [];
    for (let dt = new Date(start); dt <= new Date(end); dt.setDate(dt.getDate() + 7)) {
      let curr = new Date(dt);
      let next = new Date(curr);
      next.setDate(curr.getDate() + 7);
      arr.push([curr, next])
    }
    return [arr, minDate, maxDate];
  };

  const getDaysArray = (start: Date, end: Date) => {
    let arr = [];
    for (let dt = new Date(start); dt <= new Date(end); dt.setDate(dt.getDate() + 1)) {
        arr.push(new Date(dt))
    }
    return arr;
  };

  const [weeksArray, weeksMin, weeksMax] = getWeeksArray(minDate, maxDate);

  const xDates = getDaysArray(minDate, maxDate);

  const xDomain = [minDate, maxDate];

  React.useEffect(() => {
    /*
    const xScale = d3.scaleTime()
      .domain(xDomain)
      .range([0, width]);
    */
    // Build and Show the X scale. It is a band scale like for a boxplot: each group has an dedicated RANGE on the axis. This range has a length of x.bandwidth
    let xScale = d3.scaleBand()
      .range([ 0, width ])
      .domain(xDates.map(date => date.toLocaleDateString()))
      .padding(0.05);     // This is important: it is the space between 2 groups. 0 means no padding. 1 is the maximum.
    const yScale = d3.scaleLinear()
      .domain([
        d3.min(data, (d) => d[1]),
        d3.max(data, (d) => d[1])
      ])
      .range([height, 0]);

    // Create root container where we will append all other chart elements
    const svgEl = d3.select(svgRef.current);
    svgEl.selectAll("*").remove(); // Clear svg content before adding new elements 
    const svg = svgEl
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    svg.append("g").call( d3.axisLeft(yScale) )

    // Add X grid lines with labels
    const xAxis = d3.axisBottom(xScale)
      .ticks(5)
      .tickSize(-height - margin.bottom)
      .tickValues(xScale.domain().filter(function(d,i){ return !(i%20)}))
    const xAxisGroup = svg.append("g")
      .attr("transform", `translate(0, ${height + (margin.bottom / 2)})`)
      .call(xAxis);
    xAxisGroup.select(".domain").remove();
    //xAxisGroup.selectAll("line").attr("stroke", "rgba(255, 255, 255, 0.2)");
    xAxisGroup.selectAll("line").attr("stroke", "rgba(255, 255, 255, 0)");
    xAxisGroup.selectAll("text")
      .attr("opacity", 0.5)
      .attr("color", "black")
      .attr("font-size", "0.5rem")
      .attr("transform", `rotate(90)`)

    function kernelDensityEstimator(kernel: any, X: any) {
      return function(V: any) {
        return X.map(function(x: any) {
          return [x, d3.mean(V, function(v: any) { return kernel(x - v); })];
        });
      };
    }
    function kernelEpanechnikov(k: any) {
      return function(v: any) {
        return Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0;
      };
    }

    let kde = kernelDensityEstimator(kernelEpanechnikov(.2), yScale.ticks(50))

    let histogram = d3.bin()
      .domain(yScale.domain())
      .thresholds(yScale.ticks(20))    // Important: how many bins approx are going to be made? It is the 'resolution' of the violin plot
      .value(d => d);

    let groupBins = d3.rollup(data, d => {
      let input = d.map(g => g[1])
      //let bins = histogram(input)
      let density = kde(input);
      return density;
    }, d => { return d[0].toLocaleDateString() });

    // What is the biggest value that the density estimate reach?
    let maxNum = 0;
    for (let bins of groupBins) {
      let max = d3.max(bins[1].map(b => b[1]));
      maxNum = Math.max(maxNum, max)
    }

    // The maximum width of a violin must be x.bandwidth = the width dedicated to a group
    let xNum = d3.scaleLinear()
      .range([0, xScale.bandwidth()])
      .domain([-maxNum/10,maxNum/10])

    svg.append('g')
      .selectAll("violin")
      .data(groupBins)
      .enter()        // So now we are working group per group
      .append("g")
        .attr("transform", function(d){ return("translate(" + xScale(d[0]) +" ,0)") } ) // Translation on the right to be at the group position
      .append("path")
          .datum(function(d){ return(d[1])})     // So now we are working density per density
          .style("stroke", "none")
          .style("fill","#69b3a2")
          .attr("d", d3.area()
              .x0(function(d){ return(xNum(-d[1])) } )
              .x1(function(d){ return(xNum(d[1])) } )
              .y(function(d){ return(yScale(d[0])) } )
              .curve(d3.curveCatmullRom)    // This makes the line smoother to give the violin appearance. Try d3.curveStep to see the difference
          );
  }, [data, width, height, margin]);

  return <svg ref={svgRef} width={svgWidth} height={svgHeight} />;
};

export default ViolinChart;
