import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { disconnectedCoincidences, weldPhysicalSurface, prepareSurface } from './generate-soft-tissue.mjs';
import { positionGroups } from '../src/domain/physics/position-groups.mjs';

const geometry=(positions,indices)=>{
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions.flat(),3));g.setIndex(indices);return g;
};
const faceFor=g=>({positions:Array.from({length:g.attributes.position.count},(_,i)=>[g.attributes.position.getX(i),g.attributes.position.getY(i),g.attributes.position.getZ(i)]),indices:Array.from(g.index.array),normalization:{center:[10,20,30],scale:2},units:{metresPerSourceUnit:0.1,verticalAxis:[0,1,0]}});

describe('continuous mechanical face surface',()=>{
  it('detects near-coincident disconnected local fans even in the same global component, with source locations',()=>{
    const g=geometry([[0,0,0],[1,0,0],[0,1,0],[0.0000005,0,0],[-1,0,0]],[0,1,2,3,2,4]);
    const face=faceFor(g),report=disconnectedCoincidences(face,g);
    expect(report.disconnectedGroups).toBe(1);
    expect(report.groups[0].proxyVertices).toEqual([0,3]);
    expect(new Set(report.groups[0].globalComponents).size).toBe(1);
    expect(report.groups[0].sourceVertices).toContain(0);
    expect(report.groups[0].positionsSource[0]).toEqual([10,20,30]);
    const welded=weldPhysicalSurface(g);
    expect(welded.attributes.position.count).toBe(4);
    expect(disconnectedCoincidences(face,welded).disconnectedGroups).toBe(0);
    expect(Array.from(welded.index.array)).toEqual([0,1,2,0,2,3]);
  });
  it('shares smooth nodes independently of normal attributes or triangle ordering',()=>{
    const g=geometry([[0,0,0],[1,0,0],[0,1,0],[0,0,0],[0,1,0],[-1,0,0]],[0,1,2,3,4,5]);
    g.setAttribute('normal',new Float32BufferAttribute([0,0,1,0,0,1,0,0,1,0,0.1,0.995,0,0.1,0.995,0,0.1,0.995],3));
    const welded=weldPhysicalSurface(g);
    expect(welded.attributes.position.count).toBe(4);
    expect(disconnectedCoincidences(faceFor(g),welded).disconnectedGroups).toBe(0);
    const prepared=prepareSurface(faceFor(g),{target:3000});
    expect(prepared.topologyReport.afterCreaseWeld.disconnectedGroups).toBe(0);
  });
  it('checks neighboring spatial cells and preserves distinct nearby features',()=>{
    expect(positionGroups([[0.00000099,0,0],[0.00000101,0,0],[0.001,0,0]])).toEqual([[0,1],[2]]);
    expect(()=>weldPhysicalSurface(geometry([[0,0,0],[0.0000001,0,0],[0,1,0]],[0,1,2]))).toThrow('collapses proxy triangle 0');
  });
});
