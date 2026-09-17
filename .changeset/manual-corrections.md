---
"vlc-rpc": minor
---

Ahora se puede corregir a mano lo que la app identifica mal, o lo que no tiene fuente posible.

- Desde la pantalla principal, en la fila "Correction", se abre un formulario ya cargado con lo que la app dedujo, asi que corregir es editar y no escribir de cero. Para video se puede cambiar titulo, caratula y si es pelicula o serie; para audio solo la caratula, porque el texto de audio se arma con los tags del archivo.
- La correccion gana siempre. No compite ni se pondera, y para audio tambien le gana a la caratula que el archivo trae incrustada, que es el caso mas comun: un MP3 con una portada equivocada o de baja calidad.
- Guardar una correccion borra lo que la app habia cacheado para ese archivo, asi que al borrarla se vuelve a buscar de verdad en vez de reaparecer la respuesta equivocada.
- Las correcciones guardadas se ven y se borran desde Ajustes. Cada una dice a que archivos se aplica, porque una misma serie con dos nombres de release cuenta como dos cosas distintas y conviene poder ver por que una correccion dejo de aplicarse.
- Si la URL de la caratula no sirve se dice por que: que no es una URL, que no responde, o que responde pero no es una imagen.
