// @ts-nocheck
import React from "react";
import * as d3 from "d3";

export interface ChartProps {
  data: { items: Datum[] }[],
  dimensions: { width: any, height: any, margin: any },
  xDomain: [Date, Date],
  onHover: (item: Datum | undefined) => void,
  categories: string[],
}

const DateScatter = ({ data, dimensions, xDomain, onHover, categories }: ChartProps) => {
  const svgRef = React.useRef(null);
  const { width, height, margin } = dimensions;
  const svgWidth = width + margin.left + margin.right;
  const svgHeight = height + margin.top + margin.bottom;

  React.useEffect(() => {
    const xScale = d3.scaleTime()
      .domain(xDomain)
      .range([0, width]);
    const yScale = d3.scaleLinear()
      .domain([
        d3.min(data[0].items, (d) => d.value),
        d3.max(data[0].items, (d) => d.value)
      ])
      .range([height, 0]);
    // Create root container where we will append all other chart elements
    const svgEl = d3.select(svgRef.current);
    svgEl.selectAll("*").remove(); // Clear svg content before adding new elements 
    const svg = svgEl
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add X grid lines with labels
    const xAxis = d3.axisBottom(xScale)
      .ticks(5)
      .tickSize(-height - margin.bottom);
    const xAxisGroup = svg.append("g")
      .attr("transform", `translate(0, ${height + (margin.bottom / 2)})`)
      .call(xAxis);
    xAxisGroup.select(".domain").remove();
    xAxisGroup.selectAll("line").attr("stroke", "rgba(255, 255, 255, 0.2)");
    xAxisGroup.selectAll("text")
      .attr("opacity", 0.5)
      .attr("color", "white")
      .attr("font-size", "0.75rem");

    // Add Y grid lines with labels
    const yAxis = d3.axisLeft(yScale)
      .ticks(categories.length)
      .tickSize(-width)
      .tickFormat((index) => {
        if (index < 0 || index >= categories.length) {
          return '';
        }
        return categories[index];
      });
    const yAxisGroup = svg.append("g").call(yAxis);
    yAxisGroup.select(".domain").remove();
    yAxisGroup.selectAll("line").attr("stroke", "rgba(255, 255, 255, 0.2)");
    yAxisGroup.selectAll("text")
      .attr("opacity", 0.5)
      .attr("color", "white")
      .attr("font-size", "0.75rem");

    // Draw the lines
    /*
    const line = d3.line()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.value));
    svg.selectAll(".line")
      .data(data)
      .enter()
      .append("path")
      .attr("fill", "none")
      .attr("stroke", (d) => d.color)
      .attr("stroke-width", 3)
      .attr("d", (d) => line(d.items));
    */

    svg.append('g')
      .selectAll("dot")
      .data(data[0].items)
      .enter()
      .append("circle")
      .attr("cx", d => xScale(d.date))
      .attr("cy", d => yScale(d.value))
      .attr("r", d => d.size)
      .style("fill", d => d.size === 3 ? "#69b3a2" : '#b3697a')
      .on('mouseover', function (d, i) {
        onHover(i);
      })
      .on('mouseout', function (d, i) {
        onHover(undefined);
      });
  }, [data, width, height, margin, onHover, xDomain, categories]);

  return <svg ref={svgRef} width={svgWidth} height={svgHeight} />;
};

export default DateScatter;
