export default {
    root: 'src/',            // тут лежать index.html, script.js, style.css
    publicDir: '../static/', // папка з текстурами (її вміст потрапляє в корінь сайту)
    base: './',              // ВАЖЛИВО для GitHub Pages: відносні шляхи
    server: {
        host: true,
        open: true
    },
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        sourcemap: false
    }
}
