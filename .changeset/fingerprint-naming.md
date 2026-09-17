---
"vlc-rpc": minor
---

Un audio sin tags que la app identifica por el sonido ahora se muestra en Discord con su nombre real y no con el del archivo.

- Antes la huella acustica servia solo para la portada. La app sabia que sonaba "Probablemente" de Christian Nodal y en Discord se leia "Christian Nodal - Probablemente (Official Lyric Video)", que es un nombre de archivo con ruido de YouTube adentro.
- Poner el nombre exige mas confianza que poner la portada. Una portada que se rechaza deja un hueco honesto, un texto siempre se muestra, asi que reemplazarlo pide una coincidencia mas segura. Una que alcanza para una cosa y no para la otra da la portada y deja el texto como estaba.
- Una correccion escrita a mano le sigue ganando a todo, y un archivo con tags propios se sigue leyendo de sus tags. Esto cambia solo lo que pasa cuando los tags no nombran nada.
- El panel de la pantalla principal ahora avisa cuando el nombre salio del sonido y no del archivo, con un boton al lado para volver a lo que dice el archivo. Ese rechazo se guarda como una correccion mas: aparece en la lista de Settings y se quita desde ahi.
