% untels.cls — Formato de Plan de Tesis y Tesis, UNTELS (Ingeniería de Sistemas)
% Norma: Formatos del Plan de Tesis y Tesis UNTELS (2023) + APA 7 en español.
% A4; márgenes izq. 3 cm, der./sup./inf. 2,5 cm; Times New Roman 12; interlineado 1,5;
% sangría 1,27 cm; capítulos en página nueva; número de página centrado abajo.
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{untels}[2026/09/26 Formato UNTELS para plan de tesis y tesis]

\LoadClass[12pt,a4paper,oneside]{report}

% ---------------------------------------------------------------- página y fuente
\RequirePackage[a4paper,left=3cm,right=2.5cm,top=2.5cm,bottom=2.5cm,footskip=1.25cm]{geometry}
\RequirePackage[T1]{fontenc}
\RequirePackage[utf8]{inputenc}
\RequirePackage{newtxtext,newtxmath}
\RequirePackage[spanish,es-tabla,es-lcroman,es-nodecimaldot,es-noshorthands]{babel}
\RequirePackage{microtype}
\RequirePackage{setspace}
\RequirePackage{ragged2e}
\RequirePackage{indentfirst}
\RequirePackage{etoolbox}
\RequirePackage{xcolor}
\RequirePackage{colortbl}
\RequirePackage{graphicx}
\RequirePackage{array,booktabs,longtable,tabularx,multirow,makecell}
\RequirePackage{pdflscape}
\RequirePackage{pdfpages}
\RequirePackage{enumitem}
\RequirePackage{amsmath}
\RequirePackage{float}
\RequirePackage{calc}

\setlength{\parindent}{1.27cm}
\setlength{\parskip}{0pt}
\graphicspath{{figuras/}{figuras/out/}}

% ---------------------------------------------------------------- modo e hipótesis
\newif\ifmodoplan
\newif\ifconhipotesis
\newcommand{\modoplan}{\modoplantrue}
\newcommand{\modotesis}{\modoplanfalse}

% Interlineado: \ConfigurarInterlineado{1.5} (norma UNTELS) o {2} (APA puro)
\newcommand{\ConfigurarInterlineado}[1]{%
  \ifdimequal{#1pt}{2pt}{\AtBeginDocument{\doublespacing}}{\AtBeginDocument{\onehalfspacing}}}
% Alineación: \ConfigurarAlineacion{justificado} o {izquierda}
\newcommand{\ConfigurarAlineacion}[1]{%
  \ifstrequal{#1}{izquierda}{\AtBeginDocument{\RaggedRight\setlength{\parindent}{1.27cm}}}{}}
\AtBeginDocument{\onehalfspacing}

% Tablas: interlineado sencillo y letra de 11 pt dentro de las tablas
\AtBeginEnvironment{tabular}{\setstretch{1}}
\AtBeginEnvironment{tabularx}{\setstretch{1}}
\AtBeginEnvironment{longtable}{\setstretch{1}}

% ---------------------------------------------------------------- títulos
\RequirePackage{titlesec}
\renewcommand{\thechapter}{\Roman{chapter}}
\renewcommand{\thesection}{\arabic{chapter}.\arabic{section}}
\renewcommand{\thesubsection}{\thesection.\arabic{subsection}}
\renewcommand{\thesubsubsection}{\thesubsection.\arabic{subsubsection}}
\setcounter{secnumdepth}{2}
\setcounter{tocdepth}{2}

% Nivel 1: "I. PLANTEAMIENTO DEL PROBLEMA", negrita, centrado, página nueva
\titleformat{\chapter}[block]{\normalfont\normalsize\bfseries\centering}{\thechapter.}{0.6em}{}
\titleformat{name=\chapter,numberless}[block]{\normalfont\normalsize\bfseries\centering}{}{0pt}{}
\titlespacing*{\chapter}{0pt}{0pt}{18pt}
% Nivel 2: "1.1 Descripción del problema", negrita, al margen
\titleformat{\section}{\normalfont\normalsize\bfseries}{\thesection}{1em}{}
\titlespacing*{\section}{0pt}{12pt}{6pt}
% Nivel 3: "1.4.1 Delimitación espacial", negrita, sangrado
\titleformat{\subsection}{\normalfont\normalsize\bfseries}{\thesubsection}{1em}{}
\titlespacing*{\subsection}{1.27cm}{12pt}{6pt}
% Nivel 4 (sin número): negrita cursiva, sangrado
\titleformat{\subsubsection}{\normalfont\normalsize\bfseries\itshape}{}{0pt}{}
\titlespacing*{\subsubsection}{1.27cm}{10pt}{4pt}

% Título sin número que sí aparece en el índice (INTRODUCCIÓN, RESUMEN, ANEXOS...)
\newcommand{\capitulosinnumero}[1]{%
  \chapter*{#1}\addcontentsline{toc}{chapter}{#1}}
% Título sin número que no aparece en el índice (DEDICATORIA, AGRADECIMIENTOS)
\newcommand{\paginapreliminar}[1]{\chapter*{#1}}
% Anexo: "Anexo 1. Matriz de consistencia" (en el índice, nivel sección)
\newcommand{\anexo}[1]{%
  \par\noindent{\bfseries #1}\par\addcontentsline{toc}{section}{#1}\medskip}

% ---------------------------------------------------------------- índices
\RequirePackage[titles]{tocloft}
\renewcommand{\cftchapfont}{\bfseries}
\renewcommand{\cftchappagefont}{\bfseries}
\renewcommand{\cftchapleader}{\bfseries\cftdotfill{\cftdotsep}}
\renewcommand{\cftchapaftersnum}{.}
\setlength{\cftchapnumwidth}{2.6em}
\setlength{\cftbeforechapskip}{4pt}
\setlength{\cftsecindent}{1.5em}
\setlength{\cftsecnumwidth}{2.6em}
\setlength{\cftsubsecindent}{4.1em}
\setlength{\cftsubsecnumwidth}{3.3em}
\renewcommand{\cfttabpresnum}{Tabla~}
\renewcommand{\cfttabaftersnum}{.}
\setlength{\cfttabnumwidth}{5.2em}
\setlength{\cfttabindent}{0pt}
\renewcommand{\cftfigpresnum}{Figura~}
\renewcommand{\cftfigaftersnum}{.}
\setlength{\cftfignumwidth}{5.6em}
\setlength{\cftfigindent}{0pt}
\addto\captionsspanish{%
  \renewcommand{\contentsname}{ÍNDICE}%
  \renewcommand{\listtablename}{ÍNDICE DE TABLAS}%
  \renewcommand{\listfigurename}{ÍNDICE DE FIGURAS}%
  \renewcommand{\tablename}{Tabla}%
  \renewcommand{\figurename}{Figura}%
  \renewcommand{\bibname}{REFERENCIAS BIBLIOGRÁFICAS}%
  \renewcommand{\appendixname}{Anexo}}

% ---------------------------------------------------------------- tablas y figuras (APA 7)
% Etiqueta "Tabla 1" en negrita arriba; en la línea siguiente el título en cursiva.
% Para figuras: escribir \caption ANTES de \includegraphics.
\RequirePackage{caption}
\captionsetup{labelfont=bf,textfont=it,labelsep=newline,justification=raggedright,
  singlelinecheck=off,position=top,skip=4pt,font={normalsize,stretch=1}}
\captionsetup[longtable]{labelfont=bf,textfont=it,labelsep=newline,justification=raggedright,
  singlelinecheck=off,position=top}
\counterwithout{figure}{chapter}
\counterwithout{table}{chapter}
\counterwithout{equation}{chapter}
% Sin espacio extra por capítulo en los índices de tablas y figuras
\patchcmd{\@chapter}{\addtocontents{lof}{\protect\addvspace{10\p@}}}{}{}{}
\patchcmd{\@chapter}{\addtocontents{lot}{\protect\addvspace{10\p@}}}{}{}{}
% Tablas largas alineadas al margen izquierdo, como su título
\setlength{\LTleft}{0pt}
\setlength{\LTright}{\fill}

% Nota debajo de tabla o figura: \nota{Elaboración propia.} → "Nota. Elaboración propia."
\newcommand{\nota}[1]{\par\vspace{4pt}{\setstretch{1}\RaggedRight\small\textit{Nota.} #1\par}}

% Columnas de ancho fijo alineadas a la izquierda para tablas con texto largo
\newcolumntype{L}[1]{>{\RaggedRight\arraybackslash}p{#1}}
\newcolumntype{C}[1]{>{\Centering\arraybackslash}p{#1}}
\newcolumntype{Y}{>{\RaggedRight\arraybackslash}X}

% Código fuente (fragmentos relevantes en 4.2.1): estilo sobrio, tildes en UTF-8
\RequirePackage{listings}
\lstset{basicstyle=\ttfamily\small\setstretch{1},columns=fullflexible,keepspaces=true,
  breaklines=true,frame=tb,framerule=0.4pt,numbers=left,numberstyle=\tiny,numbersep=6pt,
  xleftmargin=1.5em,showstringspaces=false,tabsize=2,
  keywordstyle=\bfseries,commentstyle=\itshape,stringstyle=\ttfamily,
  literate={á}{{\'a}}1 {é}{{\'e}}1 {í}{{\'i}}1 {ó}{{\'o}}1 {ú}{{\'u}}1 {ñ}{{\~n}}1
    {Á}{{\'A}}1 {É}{{\'E}}1 {Í}{{\'I}}1 {Ó}{{\'O}}1 {Ú}{{\'U}}1 {Ñ}{{\~N}}1
    {ü}{{\"u}}1 {¿}{{?`}}1 {¡}{{!`}}1}
\renewcommand{\lstlistingname}{Código}
\lstset{numberbychapter=false}

\setlist{nosep,leftmargin=*}
\setlist[enumerate]{label=\arabic*.}

% ---------------------------------------------------------------- referencias (APA 7, español)
\RequirePackage[autostyle=false,style=english]{csquotes}
\RequirePackage[style=apa,backend=biber]{biblatex}
\DeclareLanguageMapping{spanish}{spanish-apa}
% APA 7 en español: "y" (sin coma serial) en lugar de "&", en el texto y en las referencias
\DeclareDelimFormat[bib,biblist]{finalnamedelim}{%
  \ifthenelse{\value{listcount}>\maxprtauth}{}{\addspace\bibstring{and}\space}}
\DeclareDelimFormat[textcite]{finalnamedelim}{\addspace\bibstring{and}\space}
\DeclareDelimFormat[parencite]{finalnamedelim}{\addspace\bibstring{and}\space}
% Sin coma después del penúltimo autor en la lista de referencias ("Kim, C. y Lee, J.")
\renewcommand*{\apablx@ifrevnameappcomma}{%
  \iftoggle{apablx@wantcomma}
    {\ifboolexpr{test {\ifnumless{\value{listcount}}{\numexpr\value{liststop}-1\relax}}
                 or test \ifmorenames}}
    {\@secondoftwo}}
\setlength{\bibhang}{1.27cm}
\setlength{\bibitemsep}{0pt}

% ---------------------------------------------------------------- páginas
% La carátula cuenta como página i (o 1 en el plan) pero no muestra número.
\newcommand{\iniciopreliminares}{\pagenumbering{roman}}
\newcommand{\iniciocuerpo}{\clearpage\pagenumbering{arabic}}

% ---------------------------------------------------------------- hipervínculos
\RequirePackage[hidelinks,bookmarksnumbered,pdfencoding=auto]{hyperref}
\RequirePackage[all]{hypcap}

\endinput
