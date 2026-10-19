import test from 'node:test';
import assert from 'node:assert/strict';
import {isStaffDesktopLayout,usesCompactLayout} from '../src/ui/layout-role.js';

test('Responsable et Employé utilisent les pages mobiles sur ordinateur',()=>{
 for(const role of ['responsable','employe']){
  assert.equal(isStaffDesktopLayout(role,false),true);
  assert.equal(usesCompactLayout(role,false),true);
 }
});
test('Administrateur et Point de vente conservent les pages desktop historiques',()=>{
 for(const role of ['admin','role_point-de-vente','point_de_vente','point-de-vente','lecture_seule',undefined,null]){
  assert.equal(isStaffDesktopLayout(role,false),false);
  assert.equal(usesCompactLayout(role,false),false);
 }
});
test('Toutes les catégories gardent leur présentation mobile sous 761 px',()=>{
 for(const role of ['admin','role_point-de-vente','responsable','employe',undefined]){
  assert.equal(usesCompactLayout(role,true),true);
  assert.equal(isStaffDesktopLayout(role,true),false);
 }
});
