---
"vlc-rpc": major
---

La interfaz se rehizo entera para parecerse a Discord.

Es un cambio mayor porque lo que se opera es otra cosa: quien vuelva a abrir la app no la reconoce.

- La navegacion pasa a una barra vertical negra a toda la altura de la ventana, y el estado de conexion de VLC y de Discord ahora se ve desde cualquier pantalla, no solo desde la principal.
- Se recupero alto util: desaparecio el pie de ventana y la barra de navegacion horizontal.
- La pantalla principal ahora muestra lado a lado lo que reporta VLC y lo que se le envio a Discord, que es el trabajo entero de esta app, asi que una portada o un titulo equivocado se ven de una.
- Los colores, los tamaños de texto y los espaciados se rehicieron sobre una escala unica calibrada contra Discord. El texto dejo de ser blanco puro, que era lo que daba ese aspecto duro.
- El foco de teclado ahora se ve en todos lados. Antes el anillo de foco era del mismo color que el boton principal, o sea invisible.
- La pantalla de configuracion inicial ya no se salia de la ventana, y ademas se acorto para que no haga falta scrollear.
- Las animaciones se basan en curvas de resorte. Con "reducir movimiento" activado se quita el desplazamiento pero se mantienen los fundidos, asi que nada aparece de golpe sin explicacion.
- Elegir un formato de presencia ahora funciona con el teclado y se anuncia correctamente.
