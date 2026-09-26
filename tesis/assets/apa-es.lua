-- Filtro de pandoc (va DESPUÉS de --citeproc): APA 7 en español usa "y" en lugar de "&",
-- sin coma antes: "Kim, C., & Lee, J." -> "Kim, C. y Lee, J."; "(Kim & Lee, 2024)" -> "(Kim y Lee, 2024)".
function Inlines(inlines)
  for i = 1, #inlines do
    local el = inlines[i]
    if el.t == "Str" and el.text == "&" then
      el.text = "y"
      local prev = inlines[i - 2]
      if inlines[i - 1] and inlines[i - 1].t == "Space" and prev and prev.t == "Str" then
        prev.text = prev.text:gsub(",$", "")
      end
    end
  end
  return inlines
end
