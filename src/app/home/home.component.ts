import { Component, ViewChild, ElementRef } from '@angular/core';
import * as XLSX from 'xlsx';
import * as _ from 'lodash';
import * as d3 from 'd3';
import { DataModel } from '../model/dataModel';
import { Runtime, Inspector } from '@observablehq/runtime';
import define from '@d3/zoomable-sunburst';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss']
})
export class HomeComponent {

    constructor() {
        this.dataModel = {
            name: 'All',
            children: []
        };
        this.color = d3.scaleOrdinal(d3.quantize(d3.interpolateRainbow, this.dataModel.children.length + 1));
    }

    color: any;
    willDownload = false;
    colors: string[] = ['#A88CCC', '#D98ACF', '#FFAE91', '#EED482', '#7BCDE8', '#FE93B5', '#CFF69D', '#77ECC8'];
    @ViewChild('chart')
    private chartContainer: ElementRef;
    @ViewChild('sunburst') sunburst: ElementRef;
    // margin = { top: 20, right: 20, bottom: 30, left: 40 };
    result: any;
    dataModel: DataModel;
    width = 975;
    radius = this.width / 2;
    parent: d3.Selection<SVGCircleElement, d3.HierarchyRectangularNode<unknown>, null, undefined>;
    path: d3.Selection<Element | Document | d3.EnterElement | Window | SVGPathElement, d3.HierarchyRectangularNode<unknown>, SVGGElement, unknown>;
    label: d3.Selection<Element | Document | d3.EnterElement | Window | SVGTextElement, d3.HierarchyRectangularNode<unknown>, SVGGElement, unknown>;
    root: d3.HierarchyRectangularNode<unknown>;
    g: any;

    arc = d3.arc()
        .startAngle(d => d.x0)
        .endAngle(d => d.x1)
        .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
        .padRadius(this.radius / 4)
        .innerRadius(d => d.y0)
        .outerRadius(d => d.y1 - 1);

    // .startAngle(d => d.x0)
    // .endAngle(d => d.x1)
    // .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
    // .padRadius(this.radius * 1.5)
    // .innerRadius(d => d.y0 * this.radius)
    // .outerRadius(d => Math.max(d.y0 * this.radius, d.y1 * this.radius - 1));

    onFileChange(ev: { target: { files: any[]; }; }) {
        let workBook = null;
        let jsonData: any = null;
        const reader = new FileReader();
        const file = ev.target.files[0];
        reader.onload = (event) => {
            const excelData = reader.result;
            workBook = XLSX.read(excelData, { type: 'binary' });
            jsonData = workBook.SheetNames.reduce((initial: { [x: string]: unknown[]; }, name: string | number) => {
                const sheet = workBook.Sheets[name];
                initial[name] = XLSX.utils.sheet_to_json(sheet);
                return initial;
            }, {});
            const appData: any[] = jsonData[workBook.SheetNames[0]];
            const result = this.convertToDesiredJson(appData);
            // document.getElementById('output').innerHTML = result.slice(0, 300).concat('...');
            // this.setDownload(result);
            this.createChart();
        };
        reader.readAsBinaryString(file);
    }

    convertToDesiredJson(appData: any[]): string {
        const result = {
            name: 'All',
            children: []
        };
        const aspGrp = _.groupBy(appData, 'ASP');
        const colorIndexUsed: number[] = [];

        _.forOwn(aspGrp, (key: any[], value: any) => {
            let random = Math.floor((Math.random() * 7)) + 1;
            while (colorIndexUsed.indexOf(random) >= 0) {
                random = Math.floor((Math.random() * 7)) + 1;
            }
            colorIndexUsed.push(random);
            const fillColor = this.colors[random];
            const aspData = {
                name: value,
                children: [],
                color: fillColor
            };
            const categoryGrp = _.groupBy(key, 'Category');
            _.forOwn(categoryGrp, (categorykey: any[], categoryValue: any) => {
                const categoryData = {
                    name: categoryValue,
                    children: [],
                    color: fillColor + '99'
                };
                const maturityGrp = _.groupBy(categorykey, 'Maturity');
                _.forOwn(maturityGrp, (maturityKey: any[], maturityValue: any) => {
                    const maturityData = {
                        name: maturityValue,
                        children: [],
                        color: fillColor + '95'
                    };
                    maturityKey.forEach(technology => {
                        maturityData.children.push({
                            name: technology.Technology,
                            value: 1,
                            color: fillColor + '90'
                        });
                    });
                    categoryData.children.push(maturityData);
                });
                aspData.children.push(categoryData);
            });
            result.children.push(aspData);
        });
        this.dataModel = result;

        return JSON.stringify(result);
    }

    private createChart(): void {
        d3.select('svg').remove();

        this.root = this.partition(this.dataModel);
        const element = this.chartContainer.nativeElement;

        const data = this.dataModel;

        const svg = d3.select(element).append('svg');

        svg.append('g')
            .attr('fill-opacity', 0.8)
            .selectAll('path')
            .data(this.root.descendants().filter(d => d.depth))
            .join('path')
            .attr('fill', d => {
                while (d.depth > 1) {
                    d = d.parent;
                }
                return color(d.data);
            })
            .attr('d', this.arc)
            .append('title')
            .text(d => `${d.ancestors().map(d => d.data.name).reverse().join('/')}\n${this.format(d.value)}`);

        svg.append('g')
            .attr('pointer-events', 'none')
            .attr('text-anchor', 'middle')
            .attr('font-size', 10)
            .attr('font-family', 'sans-serif')
            .selectAll('text')
            .data(this.root.descendants().filter(d => d.depth && (d.y0 + d.y1) / 2 * (d.x1 - d.x0) > 10))
            .join('text')
            .attr('transform', d => {
                const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
                const y = (d.y0 + d.y1) / 2;
                return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
            })
            .attr('dy', '0.35em')
            .text(d => d.data.name);

        svg.attr('viewBox', autoBox);

        function color(data) {
            return data.color;
            // return d3.scaleOrdinal([`#383867`, `#584c77`, `#33431e`, `#a36629`, `#92462f`, `#b63e36`, `#b74a70`, `#946943`]); // .scaleOrdinal(d3.schemeCategory10); // d3.scaleOrdinal(d3.quantize(d3.interpolateRainbow, data.children.length + 1));
        }
        function autoBox() {
            document.getElementById('sunburst').appendChild(this);
            const {
                x,
                y,
                width,
                height
            } = this.getBBox();
            // document.body.removeChild(this);
            return [x, y, width, height];
        }

    }

    private createChart1(): void {
        d3.select('svg').remove();

        this.root = this.partition(this.dataModel);
        const element = this.chartContainer.nativeElement;

        const data = this.dataModel;

        const svg = d3.select(element).append('svg')
            .attr('viewBox', [0, 0, this.width, this.width])
            .style('font', '10px sans-serif');
        // .attr('width', element.offsetWidth)
        // .attr('height', element.offsetHeight);
        this.g = svg.append('g')
            .attr('transform', `translate(${element.offsetWidth / 2},${element.offsetWidth / 2})`);

        this.path = this.g.append('g')
            .selectAll('path')
            .data(this.root.descendants().slice(1))
            .join('path')
            .attr('fill', d => {
                while (d.depth > 1) {
                    d = d.parent;
                }
                return this.color(d.data.name);
            })
            .attr('fill-opacity', d => this.arcVisible(d) ? (d.children ? 0.6 : 0.4) : 0)
            .attr('d', d => this.arc(d));

        this.path.filter(d => d.children)
            .style('cursor', 'pointer')
            .on('click', this.clicked);

        this.path.append('title')
            .text(d => `${d.ancestors().map(d => d.data.name).reverse().join('/')}\n${this.format(d.value)}`);

        this.label = this.g.append('g')
            .attr('pointer-events', 'none')
            .attr('text-anchor', 'middle')
            .style('user-select', 'none')
            .selectAll('text')
            .data(this.root.descendants().slice(1))
            .join('text')
            .attr('dy', '0.35em')
            .attr('fill-opacity', d => + this.labelVisible(d))
            .attr('transform', d => this.labelTransform(d))
            .text(d => d.data.name);

        this.parent = this.g.append('circle')
            .datum(this.root)
            .attr('r', this.radius)
            .attr('fill', 'none')
            .attr('pointer-events', 'all')
            .on('click', p => this.clicked(p, this.parent));

        // function clicked(p) {
        //     this.parent.datum(p.parent || root);

        //     root.each(d => d = {
        //         x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        //         x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        //         y0: Math.max(0, d.y0 - p.depth),
        //         y1: Math.max(0, d.y1 - p.depth)
        //     });

        //     const t = g.transition().duration(750);

        //     // Transition the data on all arcs, even the ones that aren’t visible,
        //     // so that if this transition is interrupted, entering arcs will start
        //     // the next transition from the desired position.
        //     this.path.transition(t)
        //         .tween('data', d => {
        //             const i = d3.interpolate(d, d);
        //             return t => d = i(t);
        //         })
        //         .filter(d => {
        //             return this.getAttribute('fill-opacity') || arcVisible(d);
        //         })
        //         .attr('fill-opacity', d => arcVisible(d) ? (d.children ? 0.6 : 0.4) : 0)
        //         .attrTween('d', d => () => this.arc(d));

        //     this.label.filter(function (d) {
        //         return +this.getAttribute('fill-opacity') || labelVisible(d);
        //     }).transition(t)
        //         .attr('fill-opacity', d => + labelVisible(d))
        //         .attrTween('transform', d => () => labelTransform(d));
        // }

        // function arcVisible(d) {
        //     return d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
        // }

        // function labelVisible(d) {
        //     return d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
        // }

        // function labelTransform(d) {
        //     const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
        //     const y = (d.y0 + d.y1) / 2 * this.radius;
        //     return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
        // }


    }

    clicked(p, parent) {
        this.parent.datum(p.parent || this.root);

        this.root.each(d => d.data = {
            x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
            x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
            y0: Math.max(0, d.y0 - p.depth),
            y1: Math.max(0, d.y1 - p.depth)
        });

        const t = this.g.transition().duration(750);

        // Transition the data on all arcs, even the ones that aren’t visible,
        // so that if this transition is interrupted, entering arcs will start
        // the next transition from the desired position.
        this.path.transition(t)
            .tween('data', d => {
                const i = d3.interpolate(d, d);
                return t => d = i(t);
            })
            .filter(d => {
                // return this.getAttribute('fill-opacity') || this.arcVisible(d);
                return this.arcVisible(d);
            })
            .attr('fill-opacity', d => this.arcVisible(d) ? (d.children ? 0.6 : 0.4) : 0)
            .attrTween('d', d => () => this.arc(d));

        this.label.filter(d => {
            return this.labelVisible(d);
            // return this.getAttribute('fill-opacity') || this.labelVisible(d);
        }).transition(t)
            .attr('fill-opacity', d => + this.labelVisible(d))
            .attrTween('transform', d => () => this.labelTransform(d));
    }

    arcVisible(d) {
        return d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
    }

    labelVisible(d) {
        return d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
    }

    labelTransform(d) {
        const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
        const y = (d.y0 + d.y1) / 2 * this.radius;
        return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
    }

    format = (value) => d3.format(',d');

    partition = (data) => {
        return d3.partition()
            .size([2 * Math.PI, this.radius])
            (d3.hierarchy(data)
                .sum(d => d.value)
                .sort((a, b) => b.value - a.value));
    }

    partition1 = data => {
        const root = d3.hierarchy(data)
            .sum(d => d.value)
            .sort((a, b) => b.value - a.value);
        return d3.partition()
            .size([2 * Math.PI, root.height + 1])
            (root);
    }

    // setDownload(data: any) {
    //     this.willDownload = true;
    //     setTimeout(() => {
    //         const el = document.querySelector('#download');
    //         el.setAttribute('href', `data:text/json;charset=utf-8,${encodeURIComponent(data)}`);
    //         el.setAttribute('download', 'xlsxtojson.json');
    //     }, 1000);
    // }
}
