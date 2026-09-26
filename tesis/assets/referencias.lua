-- Filtro de pandoc: ubica la lista de referencias justo después del título
-- "REFERENCIAS BIBLIOGRÁFICAS" (y no al final del documento, después de los anexos).
function Header(h)
  if pandoc.utils.stringify(h):upper():find("REFERENCIAS") then
    return { h, pandoc.Div({}, pandoc.Attr("refs")) }
  end
end
