---
"vlc-rpc": minor
---

Los archivos de audio sin caratula incrustada ahora consiguen portada.

- Antes, si el archivo no traia arte adentro, Discord mostraba la imagen generica de la app. Ahora se identifica la cancion por sus tags y se busca la portada, primero en iTunes y despues en MusicBrainz mas Cover Art Archive.
- No hace falta configurar nada ni crear ninguna cuenta: ninguno de los dos servicios pide credenciales.
- Si no se encuentra una coincidencia confiable no se muestra ninguna portada, en vez de arriesgar una equivocada.
- El resultado se guarda, asi que volver a escuchar el mismo disco no repite la busqueda.
