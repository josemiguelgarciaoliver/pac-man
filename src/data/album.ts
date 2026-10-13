/**
 * Álbum familiar: cartas de Cely y recuerdos que se desbloquean al completar cada mundo
 * (niveles 10, 20, … 100). Todo el texto es editable aquí; cada línea tiene como mucho 26 caracteres.
 */
export interface AlbumEntry {
  id: string;
  kind: 'letter' | 'memory';
  world: number;
  title: string;
  from: 'cely' | 'aina' | 'aleix';
  lines: string[];
}

export const ALBUM: readonly AlbumEntry[] = [
  { id: 'letter-1', kind: 'letter', world: 1, title: 'CARTA DE CELY 0', from: 'cely', lines: ['QUERIDO PAC: SE QUE YA', 'ESTAS EN CAMINO. AINA Y', 'ALEIX SON MUY VALIENTES,', 'COMO TU. OS ESPERO.'] },
  { id: 'letter-2', kind: 'letter', world: 2, title: 'CARTA DE CELY 1', from: 'cely', lines: ['EL BOSQUE HUELE A HOJAS', 'MOJADAS. ME ACUERDO DE', 'NUESTROS PASEOS. SIGUE', 'ADELANTE, CARINO.'] },
  { id: 'letter-3', kind: 'letter', world: 3, title: 'CARTA DE CELY 2', from: 'cely', lines: ['AQUI HAY MUCHO RUIDO DE', 'MAQUINAS, PERO PIENSO EN', 'VUESTRAS RISAS Y ME DAN', 'FUERZAS.'] },
  { id: 'letter-4', kind: 'letter', world: 4, title: 'CARTA DE CELY 3', from: 'cely', lines: ['TENGO FRIO, PERO ME', 'CALIENTA SABER QUE VENIS', 'A POR MI. QUE ALEIX SE', 'ABRIGUE BIEN.'] },
  { id: 'letter-5', kind: 'letter', world: 5, title: 'CARTA DE CELY 4', from: 'cely', lines: ['ESTAS PIRAMIDES SON', 'ENORMES. AINA, TU SIEMPRE', 'ENCUENTRAS EL CAMINO:', 'AYUDA A TU PADRE.'] },
  { id: 'letter-6', kind: 'letter', world: 6, title: 'CARTA DE CELY 5', from: 'cely', lines: ['DESDE AQUI OIGO EL MAR.', 'ME RECUERDA A NUESTROS', 'VERANOS JUNTOS. FALTA', 'MUY POCO, LO SIENTO.'] },
  { id: 'letter-7', kind: 'letter', world: 7, title: 'CARTA DE CELY 6', from: 'cely', lines: ['EL VOLCAN HACE TEMBLAR', 'EL SUELO, PERO YO NO', 'TIEMBLO: SE QUE LLEGAIS.', 'OS QUIERO A LOS TRES.'] },
  { id: 'letter-8', kind: 'letter', world: 8, title: 'CARTA DE CELY 7', from: 'cely', lines: ['MIRO LAS ESTRELLAS Y', 'PIENSO EN VOSOTROS. ALEIX,', 'NO TE ASUSTES: PAPA Y', 'AINA VAN CONTIGO.'] },
  { id: 'letter-9', kind: 'letter', world: 9, title: 'CARTA DE CELY 8', from: 'cely', lines: ['EL CASTILLO ES FRIO Y', 'OSCURO, PERO TENGO LA', 'ESPERANZA DE VERTE PRONTO.', 'ULTIMO ESFUERZO, PAC.'] },
  { id: 'letter-10', kind: 'letter', world: 10, title: 'CARTA DE CELY 9', from: 'cely', lines: ['LO HABEIS CONSEGUIDO.', 'NADA ME HARIA MAS FELIZ', 'QUE ESTAR OTRA VEZ CON', 'LOS TRES. GRACIAS.'] },

  { id: 'memory-1', kind: 'memory', world: 1, title: 'RECUERDO 0: PICNIC', from: 'aina', lines: ['UNA TARDE DE PICNIC EN', 'FAMILIA, CON BOCADILLOS', 'Y MUCHAS RISAS BAJO UN', 'ARBOL ENORME.'] },
  { id: 'memory-2', kind: 'memory', world: 2, title: 'RECUERDO 1: JUEGOS', from: 'aleix', lines: ['NOCHE DE JUEGOS DE MESA.', 'ALEIX GANO TRES VECES Y', 'NO PARO DE CELEBRARLO', 'EN TODA LA CASA.'] },
  { id: 'memory-3', kind: 'memory', world: 3, title: 'RECUERDO 2: CASTILLO', from: 'aina', lines: ['UN CASTILLO DE ARENA CON', 'FOSO Y TORRES. AINA FUE', 'LA ARQUITECTA Y ALEIX', 'EL ENCARGADO DEL AGUA.'] },
  { id: 'memory-4', kind: 'memory', world: 4, title: 'RECUERDO 3: NIEVE', from: 'aleix', lines: ['EL MUNECO DE NIEVE MAS', 'TORCIDO DEL MUNDO, CON', 'BUFANDA Y UNA ZANAHORIA', 'DEMASIADO GRANDE.'] },
  { id: 'memory-5', kind: 'memory', world: 5, title: 'RECUERDO 4: MUSEO', from: 'aina', lines: ['UNA VISITA AL MUSEO. LAS', 'MOMIAS DIERON MUCHO', 'MIEDO... Y MUCHA RISA', 'EN EL CAMINO A CASA.'] },
  { id: 'memory-6', kind: 'memory', world: 6, title: 'RECUERDO 5: PLAYA', from: 'aleix', lines: ['UN DIA DE PLAYA SIN', 'PRISA: CONCHAS, OLAS Y', 'UN HELADO QUE SE DERRITIO', 'ANTES DE ACABARLO.'] },
  { id: 'memory-7', kind: 'memory', world: 7, title: 'RECUERDO 6: CUENTOS', from: 'cely', lines: ['LAS NOCHES DE CUENTOS:', 'TODOS EN LA MISMA CAMA Y', 'ALGUIEN SIEMPRE SE', 'DORMIA EL PRIMERO.'] },
  { id: 'memory-8', kind: 'memory', world: 8, title: 'RECUERDO 7: ESTRELLAS', from: 'aina', lines: ['TUMBADOS EN EL CAMPO,', 'CONTANDO ESTRELLAS FUGACES', 'Y PIDIENDO DESEOS EN', 'SILENCIO.'] },
  { id: 'memory-9', kind: 'memory', world: 9, title: 'RECUERDO 8: TARTA', from: 'aleix', lines: ['UN CUMPLEANOS CON TARTA', 'Y VELAS. EL DESEO SE', 'QUEDO EN SECRETO, PERO', 'TODOS LO ADIVINAMOS.'] },
  { id: 'memory-10', kind: 'memory', world: 10, title: 'RECUERDO 9: JUNTOS', from: 'cely', lines: ['LA FAMILIA OTRA VEZ', 'REUNIDA. NINGUN LABERINTO', 'ES TAN GRANDE COMO ESTA', 'CASA CUANDO ESTAMOS.'] },
];

/** Entradas que se desbloquean al completar el mundo `world`. */
export const albumForWorld = (world: number): AlbumEntry[] => ALBUM.filter((e) => e.world === world);
