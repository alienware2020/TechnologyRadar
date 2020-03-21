import { Component, ViewChild, ElementRef } from '@angular/core';
import * as XLSX from 'xlsx';
import * as _ from 'lodash';
import * as d3 from 'd3';
import { DataModel } from '../model/dataModel';
import { Runtime, Inspector } from '@observablehq/runtime';
import define from '@d3/zoomable-sunburst';
import { InputData } from '../model/inputModel';
import { FormsModule } from '@angular/forms';

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
        this.inputData = [{
            ASP: '',
            Category: '',
            Maturity: '',
            Technology: ''
        }];
    }

    color: any;
    willDownload = false;
    private colors: string[] = ['#A88CCC', '#D98ACF', '#FFAE91', '#EED482', '#7BCDE8', '#FE93B5', '#CFF69D', '#77ECC8'];
    @ViewChild('chart') private chartContainer: ElementRef;
    @ViewChild('sunburst') sunburst: ElementRef;
    @ViewChild('fileLabel') fileLabel: ElementRef;
    result: any;
    dataModel: DataModel;
    inputData: InputData[];
    width = 975;
    radius = this.width / 2;
    showExpandedChart = false;
    graphLoaded = false;

    arc = d3.arc()
        .startAngle(d => d.x0)
        .endAngle(d => d.x1)
        .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
        .padRadius(this.radius / 4)
        .innerRadius(d => d.y0)
        .outerRadius(d => d.y1 - 1);

    onFileChange(ev: { target: { files: any[]; }; }) {
        let workBook = null;
        let jsonData: any = null;
        const reader = new FileReader();
        const file = ev.target.files[0];
        this.fileLabel.nativeElement.innerHTML = file.name;
        this.fileLabel.nativeElement.className += ' -chosen';
        reader.onload = (event) => {
            const excelData = reader.result;
            workBook = XLSX.read(excelData, { type: 'binary' });
            jsonData = workBook.SheetNames.reduce((initial: { [x: string]: unknown[]; }, name: string | number) => {
                const sheet = workBook.Sheets[name];
                initial[name] = XLSX.utils.sheet_to_json(sheet);
                return initial;
            }, {});
            const appData: any[] = jsonData[workBook.SheetNames[0]];
            this.inputData.length = 0;
            _.forOwn(appData, (key, value) => {
                this.inputData.push(key);
            });
            this.convertToDesiredJson(appData);
            this.createChart();
        };
        reader.readAsBinaryString(file);
    }

    rerenderChart() {
        this.convertToDesiredJson(null);
        const svg = document.getElementById('sunburst').getElementsByTagName('svg')[0];
        if (svg != null) {
            svg.remove();
        }
        this.createChart();
    }

    remove(data) {
        const index = this.inputData.indexOf(data);
        this.inputData.splice(index, 1);
    }

    addItem() {
        this.inputData.push({
            ASP: '',
            Category: '',
            Maturity: '',
            Technology: ''
        });
    }

    toggleChartExpandedView() {
        this.showExpandedChart = !this.showExpandedChart;
    }
    convertToDesiredJson(appData: any[]): string {
        const result = {
            name: 'All',
            children: []
        };
        const aspGrp = _.groupBy(this.inputData, 'ASP');
        const colorIndexUsed: number[] = [];

        _.forOwn(aspGrp, (key: any[], value: any) => {
            let random = Math.floor((Math.random() * 10)) % 8;
            if (colorIndexUsed.length < 8) {
                while (colorIndexUsed.indexOf(random) >= 0) {
                    random = Math.floor((Math.random() * 7)) + 1;
                }
                colorIndexUsed.push(random);
            }
            if (colorIndexUsed.length >= 8) {
                colorIndexUsed.length = 0;
            }
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

        const root = this.partition(this.dataModel);
        const element = this.chartContainer.nativeElement;
        element.innerHTML = '';
        const data = this.dataModel;

        const svg = d3.select(element).append('svg');

        svg.append('g')
            .attr('fill-opacity', 0.8)
            .selectAll('path')
            .data(root.descendants().filter(d => d.depth))
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
            .data(root.descendants().filter(d => d.depth && (d.y0 + d.y1) / 2 * (d.x1 - d.x0) > 10))
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
        }

        function autoBox() {
            // document.getElementById('sunburst').removeChild(this);
            const {
                x,
                y,
                width,
                height
            } = this.getBBox();
            document.getElementById('sunburst').appendChild(this);
            return [x, y, width, height];
        }

        this.graphLoaded = true;
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
