import React, { useRef, useEffect, useState, useMemo } from "react";
import * as d3 from "d3";
import { COLOR_BREWER2_PALETTE } from "./Utils";

const COLORS = COLOR_BREWER2_PALETTE;

/**
 * Map neutral demo JSON → shape expected by the D3 layer.
 * For each `series_by_path` row, every `series[].times` should match `paths[path_index].times`
 * (same length and values) so upper-semicircle samples align with path knot times.
 *
 * Lower semicircle:
 * - `axis_order` = tick values in clockwise order along the bottom arc (e.g. -6,-4,…,6 for in−out).
 * - If a path includes `lower_values` (same length as `nodes`/`times`), each point is placed by that
 *   metric (e.g. raw in−out degree balance), not by cluster id. `nodes` are still used for labels/colors.
 * - Otherwise `axis_order` lists cluster ids and the legacy cluster-spoke layout is used.
 */
export function adaptDemoJsonToGlyphPayload(demo) {
    const trajectoryPayload = {
        trajectory_objects: demo.paths.map((p) => ({
            name: p.label,
            path: p.nodes,
            times: p.times,
            ...(p.lower_values != null && Array.isArray(p.lower_values)
                ? { lower_values: p.lower_values }
                : {}),
        })),
        cluster_order: demo.axis_order,
        lower_axis_ticks: demo.axis_order,
    };
    const seriesByTrajectory = demo.series_by_path.map((row) => ({
        trajectory_id: row.path_index,
        series_data: row.series.map((s) => ({
            id: s.id,
            timePoints: s.times,
            expressions: s.values,
        })),
    }));
    return { trajectoryPayload, seriesByTrajectory };
}

function resolveTrajectoryIndex(trajectoryId) {
    if (typeof trajectoryId === "string") {
        const parts = trajectoryId.split("_");
        const tail = Number.parseInt(parts[parts.length - 1], 10);
        if (!Number.isNaN(tail)) return tail;
        return Number.parseInt(trajectoryId, 10);
    }
    return Number(trajectoryId);
}

function getRingTimes(minTime, maxTime, ringCount, rawTimePoints) {
    const uniqueSorted = Array.from(
        new Set(
            (rawTimePoints || [])
                .map((t) => Number(t))
                .filter((t) => Number.isFinite(t)),
        ),
    ).sort((a, b) => a - b);

    const allIntegerTimes =
        uniqueSorted.length > 0 &&
        uniqueSorted.every((t) => Math.abs(t - Math.round(t)) < 1e-9);

    if (allIntegerTimes && uniqueSorted.length > 1) {
        const integerCandidates = uniqueSorted.slice(1);
        if (integerCandidates.length <= ringCount) {
            return integerCandidates;
        }

        const lastIndex = integerCandidates.length - 1;
        return Array.from({ length: ringCount }, (_, i) => {
            const idx = Math.round(((i + 1) / ringCount) * lastIndex);
            return integerCandidates[idx];
        });
    }

    const range = Math.max(maxTime - minTime, 0);
    return Array.from(
        { length: ringCount },
        (_, i) => minTime + ((i + 1) / ringCount) * range,
    );
}

export const GeneralTrajectoryGlyph = ({
    title = null,
    demoData,
    trajectoryData: trajectoryDataProp,
    seriesData: seriesDataProp,
    expressionData,
    selectedTrajectory: selectedTrajectoryProp,
    onTrajectoryChange,
    className,
    style,
}) => {
    const adaptedDemoData = useMemo(() => {
        if (!demoData) return null;
        return adaptDemoJsonToGlyphPayload(demoData);
    }, [demoData]);

    const trajectoryData =
        trajectoryDataProp ??
        adaptedDemoData?.trajectoryPayload ??
        null;
    const activeSeriesData =
        seriesDataProp ??
        expressionData ??
        adaptedDemoData?.seriesByTrajectory ??
        null;

    const containerRef = useRef(null);
    const svgRef = useRef(null);
    const [dimensions, setDimensions] = useState({ width: 400, height: 400 });
    const [internalTrajectory, setInternalTrajectory] = useState(0);
    const selectedTrajectory =
        selectedTrajectoryProp !== undefined
            ? selectedTrajectoryProp
            : internalTrajectory;
    const setSelectedTrajectory = (index) => {
        if (selectedTrajectoryProp === undefined) {
            setInternalTrajectory(index);
        }
        onTrajectoryChange?.(index);
    };

    useEffect(() => {
        if (!trajectoryData) return;
        let trajectoryCount = 0;
        if (
            trajectoryData.trajectory_objects &&
            Array.isArray(trajectoryData.trajectory_objects)
        ) {
            trajectoryCount = trajectoryData.trajectory_objects.length;
        }
        if (trajectoryCount > 0 && selectedTrajectory >= trajectoryCount) {
            setInternalTrajectory(0);
        }
    }, [trajectoryData, selectedTrajectory]);

    const [componentId] = useState(
        () => `general-glyph-${Math.random().toString(36).slice(2, 11)}`,
    );

    const selectedSeriesData = useMemo(() => {
        if (!activeSeriesData || !Array.isArray(activeSeriesData)) {
            return null;
        }
        const matchedSeries = activeSeriesData.find(
            (data) =>
                resolveTrajectoryIndex(data.trajectory_id) === selectedTrajectory,
        );
        return matchedSeries?.series_data ?? null;
    }, [activeSeriesData, selectedTrajectory]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const updateDimensions = () => {
            const rect = container.getBoundingClientRect();
            setDimensions({
                width: Math.max(rect.width || 400, 300),
                height: Math.max(rect.height || 400, 300),
            });
        };

        updateDimensions();
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setDimensions({
                    width: Math.max(width, 300),
                    height: Math.max(height, 300),
                });
            }
        });
        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, []);

    useEffect(() => {
        let hasValidData = false;
        if (
            trajectoryData &&
            trajectoryData.trajectory_objects &&
            Array.isArray(trajectoryData.trajectory_objects) &&
            trajectoryData.trajectory_objects.length > 0
        ) {
            hasValidData = true;
        }
        if (hasValidData && dimensions.width > 0 && dimensions.height > 0) {
            createGlyph(trajectoryData);
        }
    }, [
        trajectoryData,
        dimensions,
        activeSeriesData,
        selectedTrajectory,
        selectedSeriesData,
        title,
    ]);

    useEffect(() => {
        return () => {
            d3.select("body").selectAll(`.glyph-tooltip-${componentId}`).remove();
        };
    }, [componentId]);

    // Helper function to position tooltip within viewport
    const positionTooltip = (event, tooltip) => {
        const tooltipWidth = 300; // max-width set in CSS
        const tooltipHeight = 100; // estimated height

        let left = event.clientX + 15;
        let top = event.clientY - 10;

        // Check right boundary
        if (left + tooltipWidth > window.innerWidth) {
            left = event.clientX - tooltipWidth - 15;
        }

        // Check bottom boundary
        if (top + tooltipHeight > window.innerHeight) {
            top = event.clientY - tooltipHeight - 15;
        }

        // Check top boundary
        if (top < 0) {
            top = 10;
        }

        // Check left boundary
        if (left < 0) {
            left = 10;
        }

        tooltip.style("left", left + "px").style("top", top + "px");
    };

    const createGlyph = (dataToUse) => {
        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();

        // If no data, just clear the SVG and return
        if (!dataToUse) {
            return;
        }

        // Check if we have valid data in either structure
        let hasValidData = false;
        if (
            dataToUse.trajectory_objects &&
            Array.isArray(dataToUse.trajectory_objects) &&
            dataToUse.trajectory_objects.length > 0
        ) {
            hasValidData = true;
        } else if (Array.isArray(dataToUse) && dataToUse.length > 0) {
            hasValidData = true;
        }

        if (!hasValidData) {
            return;
        }

        const { width, height } = dimensions;
        const margin = { top: 10, right: 15, bottom: 15, left: 15 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
        const centerX = innerWidth / 2;
        const centerY = innerHeight / 2;

        // Create main group
        const g = svg
            .append("g")
            .attr("transform", `translate(${margin.left}, ${margin.top})`);

        // Create tooltip (remove existing ones first to avoid duplicates)
        d3.select("body").selectAll(`.glyph-tooltip-${componentId}`).remove();
        const tooltip = d3
            .select("body")
            .append("div")
            .attr("class", `glyph-tooltip-${componentId}`)
            .style("position", "fixed")
            .style("visibility", "hidden")
            .style("background", "rgba(0, 0, 0, 0.9)")
            .style("color", "white")
            .style("padding", "10px")
            .style("border-radius", "6px")
            .style("font-size", "12px")
            .style("pointer-events", "none")
            .style("z-index", "9999")
            .style("max-width", "300px")
            .style("box-shadow", "0 4px 8px rgba(0,0,0,0.3)")
            .style("border", "1px solid rgba(255,255,255,0.2)");

        // Draw horizontal dividing line between series (top) and cell trajectories (bottom)
        const axisLength = Math.min(innerWidth, innerHeight) * 0.98;
        g.append("line")
            .attr("x1", centerX - axisLength / 2)
            .attr("y1", centerY)
            .attr("x2", centerX + axisLength / 2)
            .attr("y2", centerY)
            .attr("stroke", "#333")
            .attr("stroke-width", 3)
            .attr("opacity", 0.8);

        // Process trajectory data
        let trajectories, clusterOrder;
        if (dataToUse.trajectory_objects && dataToUse.cluster_order) {
            trajectories = dataToUse.trajectory_objects;
            clusterOrder = dataToUse.cluster_order;
        } else {
            // Invalid structure
            console.warn("Invalid trajectory data structure:", dataToUse);
            return;
        }

        const lowerAxisTicks = dataToUse.lower_axis_ticks ?? clusterOrder;

        const maxTime = Math.max(
            ...trajectories.flatMap((traj) => {
                const pathTimes = traj.times || [];
                return pathTimes.map((pt) => parseFloat(pt));
            }),
        );

        const minTime = Math.min(
            ...trajectories.flatMap((traj) => {
                const pathTimes = traj.times || [];
                return pathTimes.map((pt) => parseFloat(pt));
            }),
        );

        const allTimePoints = trajectories
            .flatMap((traj) => (traj.times || []).map((pt) => parseFloat(pt)))
            .filter((t) => Number.isFinite(t));

        const uniqueTimePoints = Array.from(new Set(allTimePoints)).sort(
            (a, b) => a - b,
        );

        const hasOnlyIntegerTimes =
            uniqueTimePoints.length > 0 &&
            uniqueTimePoints.every((t) => Math.abs(t - Math.round(t)) < 1e-9);

        const timeSpan = Math.max(maxTime - minTime, 0);
        /** Enough fractional digits so nearby times (e.g. 0.1–0.2) do not all round to the same label. */
        const formatTimeLabel = (t) => {
            if (!Number.isFinite(t)) return "";
            if (hasOnlyIntegerTimes) return String(Math.round(t));
            const decimals = timeSpan > 0 && timeSpan < 1 ? 2 : timeSpan < 50 ? 2 : 1;
            return t.toFixed(decimals);
        };

        // Create structured data object for bottom section
        const structuredData = {
            trajectory_objects: trajectories,
            cluster_order: clusterOrder,
            lower_axis_ticks: lowerAxisTicks,
        };

        // Add time point 0 circle at center
        g.append("circle")
            .attr("cx", centerX)
            .attr("cy", centerY)
            .attr("r", 8)
            .attr("fill", "#fff")
            .attr("stroke", "#333")
            .attr("stroke-width", 2)
            .attr("opacity", 0.9);

        // Add time point label - show actual minimum time if available
        g.append("text")
            .attr("x", centerX)
            .attr("y", centerY + 2)
            .attr("text-anchor", "middle")
            .attr("font-size", "5px")
            .attr("font-weight", "bold")
            .attr("fill", "#333")
            .text(`t${formatTimeLabel(minTime)}`);

        // Create bottom section - macroscopic cell trajectories
        createBottomSection(
            g,
            structuredData,
            centerX,
            centerY,
            axisLength,
            maxTime,
            minTime,
            tooltip,
            selectedTrajectory,
            setSelectedTrajectory,
        );

        // Create top section - series gauge
        createTopSection(
            g,
            selectedSeriesData,
            centerX,
            centerY,
            axisLength,
            maxTime,
            minTime,
            tooltip,
            formatTimeLabel,
            uniqueTimePoints,
        );

        // Optional bottom title
        if (title) {
            svg
                .append("text")
                .attr("x", width / 2)
                .attr("y", height - 5)
                .attr("text-anchor", "middle")
                .attr("font-size", "12px")
                .attr("font-weight", "bold")
                .attr("fill", "#333")
                .text(title);
        }
    };

    const createBottomSection = (
        g,
        trajectoryDataStructure,
        centerX,
        centerY,
        axisLength,
        maxTime,
        minTime,
        tooltip,
        selectedTrajectory,
        setSelectedTrajectory,
    ) => {
        const bottomSection = g.append("g").attr("class", "bottom-section");
        const maxRadius = axisLength / 2 - 15;

        // Draw light brown background for the lower semicircle (soil-like color)
        const arc = d3
            .arc()
            .innerRadius(0)
            .outerRadius(maxRadius)
            .startAngle(Math.PI / 2)
            .endAngle(Math.PI * 1.5);

        bottomSection
            .append("path")
            .attr("d", arc)
            .attr("transform", `translate(${centerX}, ${centerY})`)
            .attr("fill", "#D2B48C")
            .attr("opacity", 0.2)
            .attr("stroke", "none")
            .style("cursor", "pointer");

        const parseAxisNum = (x) =>
            typeof x === "number" && Number.isFinite(x) ? x : parseFloat(String(x));

        /** Map a metric value (e.g. in−out) to an angle; ticks/angles are parallel (clockwise tick order). */
        const valueToAngleForMetric = (v, ticks, angles) => {
            if (!ticks?.length || !angles?.length) return angles[0] ?? 0;
            const pairs = ticks.map((t, i) => ({ t: parseAxisNum(t), a: angles[i] }));
            pairs.sort((p, q) => p.t - q.t);
            const vnum = Number(v);
            if (!Number.isFinite(vnum)) return pairs[0].a;
            const lo = pairs[0].t;
            const hi = pairs[pairs.length - 1].t;
            const clamped = Math.max(lo, Math.min(hi, vnum));
            if (clamped <= pairs[0].t) return pairs[0].a;
            if (clamped >= pairs[pairs.length - 1].t)
                return pairs[pairs.length - 1].a;
            for (let i = 0; i < pairs.length - 1; i++) {
                const p0 = pairs[i];
                const p1 = pairs[i + 1];
                if (clamped >= p0.t && clamped <= p1.t) {
                    const u = p1.t === p0.t ? 0 : (clamped - p0.t) / (p1.t - p0.t);
                    return p0.a + u * (p1.a - p0.a);
                }
            }
            return pairs[0].a;
        };

        const trajectoriesAll =
            trajectoryDataStructure.trajectory_objects || trajectoryDataStructure;
        const firstTraj = Array.isArray(trajectoriesAll)
            ? trajectoriesAll[0]
            : null;
        const useMetricLower =
            firstTraj?.lower_values &&
            Array.isArray(firstTraj.lower_values) &&
            firstTraj.path &&
            firstTraj.lower_values.length === firstTraj.path.length;

        let sortedClusters;
        let lowerTicks = null;
        if (useMetricLower) {
            lowerTicks = (
                trajectoryDataStructure.lower_axis_ticks ||
                trajectoryDataStructure.cluster_order ||
                []
            ).map(parseAxisNum);
            sortedClusters = lowerTicks;
        } else {
            if (
                trajectoryDataStructure.cluster_order &&
                Array.isArray(trajectoryDataStructure.cluster_order)
            ) {
                sortedClusters = trajectoryDataStructure.cluster_order.map((cluster) =>
                    typeof cluster === "number" ? cluster : parseInt(String(cluster), 10),
                );
            }
            const idsOnPaths = new Set();
            (Array.isArray(trajectoriesAll) ? trajectoriesAll : []).forEach(
                (traj) => {
                    (traj.path || []).forEach((c) => {
                        const id = typeof c === "number" ? c : parseInt(String(c), 10);
                        if (Number.isFinite(id)) idsOnPaths.add(id);
                    });
                },
            );
            const orderSet = new Set(sortedClusters || []);
            const missingOnAxis = [...idsOnPaths].filter((id) => !orderSet.has(id));
            if (missingOnAxis.length > 0 || !sortedClusters?.length) {
                sortedClusters = [...idsOnPaths].sort((a, b) => a - b);
            }
        }

        const numLines = sortedClusters.length;

        // Time → radius (shared by trajectory polyline and dashed concentric guides)
        const radiusScale = d3
            .scaleLinear()
            .domain([minTime, maxTime])
            .range([8, maxRadius]);

        const step = Math.PI / Math.max(numLines, 1);
        const angles = [];
        for (let i = 0; i < numLines; i++) {
            angles.push(step / 2.0 + i * step);
        }

        const clusterToAngle = new Map();
        if (!useMetricLower) {
            sortedClusters.forEach((cluster, index) => {
                clusterToAngle.set(Number(cluster), angles[index]);
            });
        }

        sortedClusters.forEach((tickOrCluster, index) => {
            const angle = angles[index];
            const x = maxRadius * Math.cos(angle);
            const y = maxRadius * Math.sin(angle);

            bottomSection
                .append("line")
                .attr("x1", centerX)
                .attr("y1", centerY)
                .attr("x2", centerX + x)
                .attr("y2", centerY + y)
                .attr("stroke", "#CCCCCC")
                .attr("stroke-width", 1)
                .attr("opacity", 0.6);

            bottomSection
                .append("text")
                .attr("x", centerX + x * 1.1)
                .attr("y", centerY + y * 1.1)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "central")
                .attr("font-size", "10px")
                .attr("fill", "#555")
                .text(String(tickOrCluster));
        });

        // Concentric guides: radii match [minTime, maxTime] (not 0..maxTime)
        const timeSpanBottom = Math.max(maxTime - minTime, 0);
        const timeScaleFractions = [0.25, 0.5, 0.75, 1.0];
        timeScaleFractions.forEach((fraction) => {
            const timeValue =
                timeSpanBottom > 0 ? minTime + fraction * timeSpanBottom : minTime;
            const radius = radiusScale(timeValue);

            // Draw semicircle arc for time indication (bottom half)
            const timeArc = d3
                .arc()
                .innerRadius(radius)
                .outerRadius(radius)
                .startAngle(0) // Start from right (0 radians)
                .endAngle(Math.PI); // End at left (π radians)

            bottomSection
                .append("path")
                .attr("d", timeArc)
                .attr("transform", `translate(${centerX}, ${centerY})`)
                .attr("fill", "none")
                .attr("stroke", "#E0E0E0")
                .attr("stroke-width", 0.5)
                .attr("stroke-dasharray", "2,2")
                .attr("opacity", 0.7);
        });

        // Color scale for different trajectories
        const trajectoryColors = COLORS;

        // Draw each trajectory
        const trajectories =
            trajectoryDataStructure.trajectory_objects || trajectoryDataStructure;
        trajectories.forEach((trajectory, trajIndex) => {
            const { path } = trajectory;
            const pathTimes = trajectory.times || [];
            const lowerVals = trajectory.lower_values;
            const trajectoryColor =
                trajectoryColors[trajIndex % trajectoryColors.length];

            const trajMetric =
                useMetricLower &&
                lowerVals &&
                Array.isArray(lowerVals) &&
                path &&
                lowerVals.length === path.length &&
                lowerVals.length === pathTimes.length;

            const trajectoryPoints = [];

            for (let i = 0; i < path.length; i++) {
                const cluster = parseInt(path[i], 10);
                const timeAtNode = parseFloat(pathTimes[i]);
                let angle;
                if (trajMetric) {
                    angle = valueToAngleForMetric(
                        lowerVals[i],
                        lowerTicks ?? sortedClusters,
                        angles,
                    );
                } else {
                    angle = clusterToAngle.get(Number(cluster));
                }
                const radius = radiusScale(timeAtNode);

                if (angle !== undefined) {
                    trajectoryPoints.push({
                        x: centerX + radius * Math.cos(angle),
                        y: centerY + radius * Math.sin(angle),
                        cluster: cluster,
                        time: timeAtNode,
                        angle: angle,
                        radius: radius,
                        lowerMetric: trajMetric ? lowerVals[i] : undefined,
                    });
                }
            }

            // Create smooth interpolated path between trajectory points
            if (trajectoryPoints.length > 1) {
                const pathData = [];

                for (let i = 0; i < trajectoryPoints.length - 1; i++) {
                    const current = trajectoryPoints[i];
                    const next = trajectoryPoints[i + 1];

                    // Number of interpolation points based on time difference
                    const timeDiff = Math.abs(next.time - current.time);
                    const denom = Math.max(maxTime - minTime, 1e-9);
                    const numPoints = Math.max(8, Math.floor(48 * (timeDiff / denom)));

                    for (let j = 0; j <= numPoints; j++) {
                        const t = j / numPoints;
                        const interpTime = current.time + t * (next.time - current.time);
                        const interpAngle =
                            current.angle + t * (next.angle - current.angle);
                        const interpRadius = radiusScale(interpTime);

                        pathData.push({
                            x: centerX + interpRadius * Math.cos(interpAngle),
                            y: centerY + interpRadius * Math.sin(interpAngle),
                        });
                    }
                }

                // Linear curve: cardinal splines were rounding corners so cluster-to-cluster bends disappeared
                const line = d3
                    .line()
                    .x((d) => d.x)
                    .y((d) => d.y)
                    .curve(d3.curveLinear);

                const isSelected = trajIndex === selectedTrajectory;
                const strokeWidth = isSelected ? 5 : 3;
                const opacity = isSelected ? 1 : 0.2;

                // Apply grey color to non-selected trajectories
                const finalColor = isSelected ? trajectoryColor : "#CCCCCC";

                bottomSection
                    .append("path")
                    .datum(pathData)
                    .attr("class", `trajectory-path trajectory-path-${trajIndex}`)
                    .attr("d", line)
                    .attr("fill", "none")
                    .attr("stroke", finalColor)
                    .attr("stroke-width", strokeWidth)
                    .attr("opacity", opacity)
                    .style("cursor", "pointer")
                    .on("mouseover", function (event) {
                        let html = `<strong>Trajectory ${trajIndex + 1}</strong><br/>Clusters: ${path.join(" → ")}<br/>Time range: ${pathTimes[0]?.toFixed(3) || "N/A"} - ${pathTimes[pathTimes.length - 1]?.toFixed(3) || "N/A"}`;

                        tooltip.style("visibility", "visible").html(html);
                        positionTooltip(event, tooltip);

                        // Highlight this trajectory on hover
                        if (!isSelected) {
                            // Restore original color and increase prominence for non-selected trajectories
                            d3.select(this)
                                .attr("stroke", trajectoryColor)
                                .attr("stroke-width", 4)
                                .attr("opacity", 1);
                        }
                    })
                    .on("mousemove", function (event) {
                        positionTooltip(event, tooltip);
                    })
                    .on("mouseout", function () {
                        tooltip.style("visibility", "hidden");
                        // Restore original appearance
                        if (!isSelected) {
                            d3.select(this)
                                .attr("stroke", "#CCCCCC")
                                .attr("stroke-width", 3)
                                .attr("opacity", 0.2);
                        }
                    })
                    .on("click", function () {
                        setSelectedTrajectory(trajIndex);
                    });
            }

            // Draw node markers at each time point
            trajectoryPoints.forEach((point, pointIndex) => {
                const isEndpoint = pointIndex === trajectoryPoints.length - 1;
                const isSelected = trajIndex === selectedTrajectory;
                const nodeColor = isSelected ? "#666666" : "#CCCCCC";

                if (isEndpoint) {
                    // Draw star for endpoints
                    const starElement = drawStar(
                        bottomSection,
                        point.x,
                        point.y,
                        6,
                        nodeColor,
                        isSelected ? 0.9 : 0.6,
                        `trajectory-node-${trajIndex}`,
                    );

                    // Add data attribute for cluster information to help with legend hover
                    starElement.attr("data-cluster", point.cluster);

                    // Add hover effects for stars
                    if (!isSelected) {
                        starElement
                            .style("cursor", "pointer")
                            .on("mouseover", function (event) {
                                tooltip
                                    .style("visibility", "visible")
                                    .html(
                                        `<strong>Cluster ${point.cluster}</strong><br/>Time: ${point.time.toFixed(3)}${point.lowerMetric !== undefined ? `<br/>in−out: ${point.lowerMetric}` : ""}<br/>Trajectory: ${trajIndex + 1}`,
                                    );
                                positionTooltip(event, tooltip);

                                // Emphasize hovered point without cluster-based color coding
                                d3.select(this)
                                    .attr("fill", "#666666")
                                    .attr("opacity", 1);
                            })
                            .on("mousemove", function (event) {
                                positionTooltip(event, tooltip);
                            })
                            .on("mouseout", function () {
                                tooltip.style("visibility", "hidden");

                                // Restore grey color
                                d3.select(this).attr("fill", "#CCCCCC").attr("opacity", 0.2);
                            });
                    } else {
                        // Add tooltip for selected trajectory stars
                        starElement
                            .style("cursor", "pointer")
                            .on("mouseover", function (event) {
                                tooltip
                                    .style("visibility", "visible")
                                    .html(
                                        `<strong>Cluster ${point.cluster}</strong><br/>Time: ${point.time.toFixed(3)}${point.lowerMetric !== undefined ? `<br/>in−out: ${point.lowerMetric}` : ""}<br/>Trajectory: ${trajIndex + 1}`,
                                    );
                                positionTooltip(event, tooltip);
                            })
                            .on("mousemove", function (event) {
                                positionTooltip(event, tooltip);
                            })
                            .on("mouseout", function () {
                                tooltip.style("visibility", "hidden");
                            });
                    }
                } else {
                    // Draw circle for intermediate points
                    bottomSection
                        .append("circle")
                        .attr("class", `trajectory-node-${trajIndex}`)
                        .attr("data-cluster", point.cluster) // Add data attribute for cluster information
                        .attr("cx", point.x)
                        .attr("cy", point.y)
                        .attr("r", 4)
                        .attr("fill", nodeColor)
                        .attr("stroke", "#fff")
                        .attr("stroke-width", 1)
                        .attr("opacity", isSelected ? 1 : 0.2)
                        .style("cursor", "pointer")
                        .on("mouseover", function (event) {
                            tooltip
                                .style("visibility", "visible")
                                .html(
                                    `<strong>Cluster ${point.cluster}</strong><br/>Time: ${point.time.toFixed(3)}${point.lowerMetric !== undefined ? `<br/>in−out: ${point.lowerMetric}` : ""}<br/>Trajectory: ${trajIndex + 1}`,
                                );
                            positionTooltip(event, tooltip);

                            // Restore original color on hover for non-selected trajectories
                            if (!isSelected) {
                                d3.select(this)
                                    .attr("fill", "#666666")
                                    .attr("opacity", 1);
                            }
                        })
                        .on("mousemove", function (event) {
                            positionTooltip(event, tooltip);
                        })
                        .on("mouseout", function () {
                            tooltip.style("visibility", "hidden");

                            // Restore grey color for non-selected trajectories
                            if (!isSelected) {
                                d3.select(this).attr("fill", "#CCCCCC").attr("opacity", 0.2);
                            }
                        });
                }
            });
        });
    };

    const createTopSection = (
        g,
        seriesData,
        centerX,
        centerY,
        axisLength,
        maxTime,
        minTime,
        tooltip,
        formatTimeLabel,
        availableTimePoints,
    ) => {
        const maxRadius = axisLength / 2 - 15;
        const topSection = g.append("g").attr("class", "top-section");

        // Left arc for Low Expression (red)
        const lowExprArc = d3
            .arc()
            .innerRadius(8)
            .outerRadius(maxRadius)
            .startAngle(Math.PI * 1.5)
            .endAngle(Math.PI * 1.6);

        topSection
            .append("path")
            .attr("d", lowExprArc)
            .attr("transform", `translate(${centerX}, ${centerY})`)
            .attr("fill", "red")
            .attr("opacity", 0.1)
            .attr("stroke", "none");

        // Right arc for High Expression (green)
        const highExprArc = d3
            .arc()
            .innerRadius(8)
            .outerRadius(maxRadius)
            .startAngle(Math.PI * 2.4)
            .endAngle(Math.PI * 2.5);

        topSection
            .append("path")
            .attr("d", highExprArc)
            .attr("transform", `translate(${centerX}, ${centerY})`)
            .attr("fill", "green")
            .attr("opacity", 0.1)
            .attr("stroke", "none");

        // Add concentric circles for time progression using trajectory data time range
        // These should always be shown as a time reference
        const trajectoryTimeRange = Math.max(maxTime - minTime, 0);
        const safeRange = trajectoryTimeRange > 0 ? trajectoryTimeRange : 1e-9;
        const numTimeCircles = 4;
        const ringTimes = getRingTimes(
            minTime,
            maxTime,
            numTimeCircles,
            availableTimePoints,
        );
        const labelTime = (t) =>
            formatTimeLabel ? formatTimeLabel(t) : t.toFixed(2);
        ringTimes.forEach((time) => {
            const radius = 8 + ((time - minTime) / safeRange) * (maxRadius - 8);

            // Draw complete circles
            topSection
                .append("circle")
                .attr("cx", centerX)
                .attr("cy", centerY)
                .attr("r", radius)
                .attr("fill", "none")
                .attr("stroke", "black")
                .attr("stroke-width", 1)
                .attr("opacity", 0.2);

            // Add time labels at the top of each circle
            topSection
                .append("text")
                .attr("x", centerX)
                .attr("y", centerY - radius - 5)
                .attr("text-anchor", "middle")
                .attr("font-size", "8px")
                .attr("fill", "#666")
                .text(`t${labelTime(time)}`);
            });

        // Add expression level indicators for upper semicircle (always show these)
        topSection
            .append("text")
            .attr("x", centerX - maxRadius * 0.7)
            .attr("y", centerY - 5)
            .attr("text-anchor", "middle")
            .attr("font-size", "10px")
            .attr("fill", "#666")
            .text("Low");

        topSection
            .append("text")
            .attr("x", centerX + maxRadius * 0.7)
            .attr("y", centerY - 5)
            .attr("text-anchor", "middle")
            .attr("font-size", "10px")
            .attr("fill", "#666")
            .text("High");

        // Only proceed with series specific elements if data is provided
        if (!seriesData || !Array.isArray(seriesData) || seriesData.length === 0) {
            return;
        }

        // in_minus_out belongs on the lower semicircle (lower_values), not as an upper series
        const seriesDataUpper = seriesData.filter((g) => g.id !== "in_minus_out");
        if (seriesDataUpper.length === 0) {
            return;
        }

        // Draw upper semicircle background for series area
        // Time point scale (radial distance represents time progression)
        // Use the same scaling as concentric circles and trajectory data
        const timeScale = d3
            .scaleLinear()
            .domain([minTime, maxTime])
            .range([8, maxRadius]); // Start from time point 0 circle edge (radius 8)

        // Expression scale (angular position - higher expression = more to the right)
        // Upper half only: from left (π) to right (2π) of the upper semicircle
        const expressionScale = d3
            .scaleLinear()
            .domain([0, 1])
            .range([Math.PI, 2 * Math.PI]); // From left side (180°) to right side (360°) through upper half

        // Series colors using custom color scheme
        const seriesColors = COLORS;

        seriesDataUpper.forEach((seriesInfo, seriesIndex) => {
            const color = seriesColors[seriesIndex % seriesColors.length];

            // Create expression points where angular position is determined by expression level
            const expressionPoints = seriesInfo.timePoints.map((timePoint, i) => {
                // Radius is determined by time point (progression outward)
                const radius = timeScale(timePoint);
                // Angle is determined by expression level (higher = more to the right)
                const angle = expressionScale(seriesInfo.expressions[i]);

                return {
                    x: centerX + Math.cos(angle) * radius,
                    y: centerY + Math.sin(angle) * radius,
                    timePoint: timePoint,
                    expression: seriesInfo.expressions[i],
                    angle: angle,
                    radius: radius,
                };
            });

            // Customizable curve generation function for handling angular wraparound
            const generateCustomCurve = (points, options = {}) => {
                if (points.length < 2) return null;

                const settings = {
                    samplesPerSegment: options.samplesPerSegment || 24,
                    bulgeFactor: options.bulgeFactor ?? 0.18, // 0..1 of radial gap
                };

                // Helpers
                const normalizeAngle = (angle) => {
                    let a = angle;
                    while (a < 0) a += 2 * Math.PI;
                    while (a >= 2 * Math.PI) a -= 2 * Math.PI;
                    return a;
                };

                const unwrapToShortestUpperHalf = (from, to) => {
                    // Keep path across the shortest angular distance
                    let a0 = normalizeAngle(from);
                    let a1 = normalizeAngle(to);
                    let diff = a1 - a0;
                    if (diff > Math.PI) a1 -= 2 * Math.PI;
                    else if (diff < -Math.PI) a1 += 2 * Math.PI;
                    return { a0, a1 };
                };

                let pathData = `M ${points[0].x} ${points[0].y}`;

                for (let i = 1; i < points.length; i++) {
                    const currentPoint = points[i - 1];
                    const nextPoint = points[i];

                    // Radii for concentric bounds
                    const rCurrent = Math.hypot(
                        currentPoint.x - centerX,
                        currentPoint.y - centerY,
                    );
                    const rNext = Math.hypot(
                        nextPoint.x - centerX,
                        nextPoint.y - centerY,
                    );
                    const rMin = Math.min(rCurrent, rNext);
                    const rMax = Math.max(rCurrent, rNext);

                    // Angles, constrained to the upper half [π, 2π]
                    const angCurrent = Math.atan2(
                        currentPoint.y - centerY,
                        currentPoint.x - centerX,
                    );
                    const angNext = Math.atan2(
                        nextPoint.y - centerY,
                        nextPoint.x - centerX,
                    );
                    const { a0, a1 } = unwrapToShortestUpperHalf(angCurrent, angNext);

                    // Generate interpolated points that stay between rMin..rMax and in upper half
                    const n = Math.max(2, settings.samplesPerSegment);
                    for (let s = 1; s < n; s++) {
                        const t = s / n;

                        // Interpolate angle along the shortest path
                        let a = a0 + (a1 - a0) * t;
                        let aNorm = normalizeAngle(a);
                        // Force to upper half if numerical artifacts occur
                        if (aNorm < Math.PI) aNorm = 2 * Math.PI - aNorm;

                        // Interpolate radius with optional smooth bulge, then clamp to [rMin, rMax]
                        const rLinear = rCurrent + (rNext - rCurrent) * t;
                        const gap = rMax - rMin;
                        const rBulge =
                            rLinear + gap * settings.bulgeFactor * Math.sin(Math.PI * t);
                        const r = Math.max(rMin, Math.min(rMax, rBulge));

                        const x = centerX + Math.cos(aNorm) * r;
                        const y = centerY + Math.sin(aNorm) * r; // sin(aNorm) <= 0 in [π, 2π]
                        pathData += ` L ${x} ${y}`;
                    }

                    // Ensure we land exactly on the next point
                    pathData += ` L ${nextPoint.x} ${nextPoint.y}`;
                }

                return pathData;
            };

            // Prepare points for custom curve (including starting point if needed)
            let curvePoints = [...expressionPoints];

            // Add starting point from time 0 circle edge if first point is not at time 0
            if (expressionPoints.length > 0 && expressionPoints[0].radius > 8) {
                const firstPoint = expressionPoints[0];
                const angle = Math.atan2(
                    firstPoint.y - centerY,
                    firstPoint.x - centerX,
                );
                const startX = centerX + Math.cos(angle) * 8;
                const startY = centerY + Math.sin(angle) * 8;

                curvePoints = [{ x: startX, y: startY }, ...expressionPoints];
            }

            // Calculate average expression for this series (normalized between 0 and 1)
            const avgExpression =
                seriesInfo.expressions.reduce((a, b) => a + b, 0) /
                seriesInfo.expressions.length;

            // Draw custom curve through all points
            if (curvePoints.length > 1) {
                // Configuration for curve behavior - can be customized based on needs
                const customPath = generateCustomCurve(curvePoints, {
                    samplesPerSegment: 24,
                    bulgeFactor: 0.18,
                });

                if (customPath) {
                    const curvePath = topSection
                        .append("path")
                        .attr("d", customPath)
                        .attr("stroke", color)
                        .attr("stroke-width", 3)
                        .attr("fill", "none")
                        .attr("opacity", 0.6)
                        .attr("stroke-linecap", "round")
                        .attr("stroke-linejoin", "round")
                        .style("cursor", "pointer");

                    // Create average expression radius indicator (initially hidden)
                    // The angle is already constrained to upper half (π to 2π) by expressionScale
                    const avgAngle = expressionScale(avgExpression);
                    const avgEndX = centerX + Math.cos(avgAngle) * maxRadius;
                    const avgEndY = centerY + Math.sin(avgAngle) * maxRadius;

                    const avgRadiusIndicator = topSection
                        .append("line")
                        .attr("class", `avg-expression-radius-${seriesIndex}`)
                        .attr("x1", centerX)
                        .attr("y1", centerY)
                        .attr("x2", avgEndX)
                        .attr("y2", avgEndY)
                        .attr("stroke", color)
                        .attr("stroke-width", 2)
                        .attr("stroke-dasharray", "5,3")
                        .attr("opacity", 0)
                        .style("pointer-events", "none");

                    // Add a small circle at the end of the radius to make it more visible
                    const avgRadiusEndPoint = topSection
                        .append("circle")
                        .attr("class", `avg-expression-endpoint-${seriesIndex}`)
                        .attr("cx", avgEndX)
                        .attr("cy", avgEndY)
                        .attr("r", 3)
                        .attr("fill", color)
                        .attr("stroke", "#fff")
                        .attr("stroke-width", 1)
                        .attr("opacity", 0)
                        .style("pointer-events", "none");

                    curvePath
                        .on("mouseover", function (event) {
                            d3.select(this).attr("stroke-width", 4).attr("opacity", 1);

                            // Show the average expression radius indicator
                            avgRadiusIndicator.attr("opacity", 0.8);
                            avgRadiusEndPoint.attr("opacity", 0.9);

                            const minExpression = Math.min(...seriesInfo.expressions);
                            const maxExpression = Math.max(...seriesInfo.expressions);
                            const avgExpressionFormatted = avgExpression.toFixed(2);
                            const timeSpan = `${seriesInfo.timePoints[0].toFixed(4)} - ${seriesInfo.timePoints[seriesInfo.timePoints.length - 1].toFixed(4)}`;

                            tooltip.style("visibility", "visible").html(`
                                <div><strong>Series: ${seriesInfo.id}</strong></div>
                                <div>Time span: ${timeSpan}</div>
                                <div>Value range: ${minExpression.toFixed(2)} - ${maxExpression.toFixed(2)}</div>
                                <div>Mean value: ${avgExpressionFormatted}</div>
                                <div style="font-style: italic; color: #ccc; font-size: 11px;">Dashed line shows mean value</div>
                            `);
                            positionTooltip(event, tooltip);
                        })
                        .on("mousemove", function (event) {
                            positionTooltip(event, tooltip);
                        })
                        .on("mouseout", function () {
                            d3.select(this).attr("stroke-width", 3).attr("opacity", 0.6);

                            // Hide the average expression radius indicator
                            avgRadiusIndicator.attr("opacity", 0);
                            avgRadiusEndPoint.attr("opacity", 0);

                            tooltip.style("visibility", "hidden");
                        });
                }
            }

            // Draw all points
            expressionPoints.forEach((point) => {
                topSection
                    .append("circle")
                    .attr("cx", point.x)
                    .attr("cy", point.y)
                    .attr("r", 3)
                    .attr("fill", color)
                    .attr("stroke", "#fff")
                    .attr("opacity", 0.6)
                    .style("cursor", "pointer")
                    .on("mouseover", function (event) {
                        d3.select(this).attr("r", 5).attr("opacity", 1);

                        // Show the average expression radius indicator
                        topSection
                            .select(`.avg-expression-radius-${seriesIndex}`)
                            .attr("opacity", 0.8);
                        topSection
                            .select(`.avg-expression-endpoint-${seriesIndex}`)
                            .attr("opacity", 0.9);

                        const avgExpressionFormatted = avgExpression.toFixed(2);
                        tooltip.style("visibility", "visible").html(`
                                <div><strong>Point</strong></div>
                    <div>Id: ${seriesInfo.id}</div>
                                <div>Time: ${point.timePoint.toFixed(2)}</div>
                                <div>Value: ${point.expression.toFixed(3)}</div>
                                <div>Mean value: ${avgExpressionFormatted}</div>
                                <div style="font-style: italic; color: #ccc; font-size: 11px;">Dashed line shows mean value</div>
                          `);
                        positionTooltip(event, tooltip);
                    })
                    .on("mousemove", function (event) {
                        positionTooltip(event, tooltip);
                    })
                    .on("mouseout", function () {
                        d3.select(this).attr("r", 3).attr("opacity", 0.6);

                        // Hide the average expression radius indicator
                        topSection
                            .select(`.avg-expression-radius-${seriesIndex}`)
                            .attr("opacity", 0);
                        topSection
                            .select(`.avg-expression-endpoint-${seriesIndex}`)
                            .attr("opacity", 0);

                        tooltip.style("visibility", "hidden");
                    });
            });
        });
    };

    const drawStar = (
        parent,
        cx,
        cy,
        radius,
        color,
        opacity = 1,
        className = "",
    ) => {
        const starPoints = 5;
        const angle = Math.PI / starPoints;
        let path = "";

        for (let i = 0; i < 2 * starPoints; i++) {
            const r = i % 2 === 0 ? radius : radius * 0.5;
            const x = cx + Math.cos(i * angle) * r;
            const y = cy + Math.sin(i * angle) * r;
            path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
        }
        path += " Z";

        return parent
            .append("path")
            .attr("class", className)
            .attr("d", path)
            .attr("fill", color)
            .attr("stroke", "#fff")
            .attr("stroke-width", 1)
            .attr("opacity", opacity);
    };

    const legendItems = (() => {
        if (
            !trajectoryData?.trajectory_objects ||
            !Array.isArray(trajectoryData.trajectory_objects)
        ) {
            return [];
        }
        return trajectoryData.trajectory_objects.map((traj, i) => ({
            index: i,
            name: traj.name || `Trajectory ${i + 1}`,
            color: COLORS[i % COLORS.length],
            sequence: Array.isArray(traj.path) ? traj.path.join(" → ") : "",
        }));
    })();

    const handleLegendEnter = (hoveredIndex) => {
        const svg = d3.select(svgRef.current);
        legendItems.forEach((item, index) => {
            const path = svg.select(`.trajectory-path-${index}`);
            const nodes = svg.selectAll(`.trajectory-node-${index}`);
            if (!path.empty()) {
                if (index === hoveredIndex) {
                    path
                        .attr("stroke", COLORS[index % COLORS.length])
                        .attr("stroke-width", 4)
                        .attr("opacity", 1);
                    nodes.attr("fill", "#666666").attr("opacity", 1);
                } else {
                    path
                        .attr("stroke", "#CCCCCC")
                        .attr("stroke-width", 3)
                        .attr("opacity", 0.2);
                    nodes.attr("fill", "#CCCCCC").attr("opacity", 0.2);
                }
            }
        });
    };

    const handleLegendLeave = () => {
        const svg = d3.select(svgRef.current);
        legendItems.forEach((item, index) => {
            const path = svg.select(`.trajectory-path-${index}`);
            const nodes = svg.selectAll(`.trajectory-node-${index}`);
            if (!path.empty()) {
                if (index === selectedTrajectory) {
                    path
                        .attr("stroke", COLORS[index % COLORS.length])
                        .attr("stroke-width", 5)
                        .attr("opacity", 1);
                    nodes.attr("fill", "#666666").attr("opacity", 1);
                } else {
                    path
                        .attr("stroke", "#CCCCCC")
                        .attr("stroke-width", 3)
                        .attr("opacity", 0.2);
                    nodes.attr("fill", "#CCCCCC").attr("opacity", 0.2);
                }
            }
        });
    };

    return (
        <div
            ref={containerRef}
            className={className}
            style={{
                width: "100%",
                height: "100%",
                minWidth: 320,
                minHeight: 320,
                position: "relative",
                boxSizing: "border-box",
                ...style,
            }}
        >
            {legendItems.length > 0 && (
                <div
                    style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        zIndex: 2,
                        backgroundColor: "rgba(255, 255, 255, 0.85)",
                        borderRadius: 4,
                        padding: "4px 8px",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                        maxWidth: "46%",
                        fontSize: 11,
                    }}
                >
                    {legendItems.map((item) => (
                        <div
                            key={item.index}
                            onMouseEnter={() => handleLegendEnter(item.index)}
                            onMouseLeave={handleLegendLeave}
                            onClick={() => setSelectedTrajectory(item.index)}
                            title={item.sequence ? item.sequence : item.name}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                marginBottom: 4,
                                cursor: "pointer",
                            }}
                        >
                            <div
                                style={{
                                    width: 8,
                                    height: 8,
                                    backgroundColor: item.color,
                                    flexShrink: 0,
                                }}
                            />
                            <span
                                style={{
                                    color: "#333",
                                    fontWeight: item.index === selectedTrajectory ? 600 : 400,
                                }}
                            >
                                {item.name}
                            </span>
                        </div>
                    ))}
                </div>
            )}
            <svg
                ref={svgRef}
                width={dimensions.width}
                height={dimensions.height}
                viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
                style={{
                    width: "100%",
                    height: "100%",
                    display: "block",
                    backgroundColor: "#f9f9f9",
                }}
                preserveAspectRatio="xMidYMid meet"
            />
        </div>
    );
};

export default GeneralTrajectoryGlyph;
