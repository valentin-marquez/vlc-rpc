---
"vlc-rpc": minor
---

Los audios sin tags utiles, tipicamente lo que se baja de YouTube, ahora tambien consiguen portada.

- Antes, un archivo sin artista y con un titulo que en realidad es el nombre del archivo no tenia como buscarse: ninguna busqueda por texto puede acertar con eso. Ahora se identifica la cancion por el sonido mismo, calculando una huella acustica del audio y preguntandole a AcoustID que grabacion es.
- Corre ultimo, solo cuando la correccion manual, la caratula incrustada en el archivo y la busqueda por tags ya fallaron. Es el paso mas caro de la cadena y el unico cuyo limite de uso comparten todos los usuarios de la app.
- Si la respuesta no es clara no se muestra nada: hace falta que el servicio este seguro de la coincidencia y que la segunda candidata no le pise los talones con otro artista. Entre varias ediciones se prefiere el album de estudio antes que un recopilatorio.
- Lo que responde se guarda por archivo, no por tags, asi que dos archivos sin tags nunca comparten portada y el audio se lee una sola vez.
- Requiere una clave de aplicacion incluida al compilar. Una copia del repo sin esa clave se comporta exactamente como antes.
