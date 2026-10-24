// Registro de sitios soportados. Para añadir uno nuevo, agrégale una entrada aquí:
//   id:        identificador único (se usa para el nombre de archivo en GitHub)
//   nombre:    etiqueta visible en la GUI
//   hosts:     dominios donde se inyecta el script (coincidencia por sufijo)
//   color:     color del icono circular en la GUI
//   letra:     inicial mostrada dentro del icono
//   github:    ruta del script dentro del repositorio ({id} se sustituye)
export const SITIOS_BASE = [
  {
    id: 'onlyfans',
    nombre: 'OnlyFans',
    hosts: ['onlyfans.com'],
    color: '#00AFF0',
    letra: 'O',
    github: 'scripts/{id}.js'
  }
];
