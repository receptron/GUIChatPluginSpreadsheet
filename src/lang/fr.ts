import type { Messages } from "./messages";

const fr: Messages = {
  untitled: "Tableur",
  sheetCount: (count) => (count === 1 ? "1 feuille" : `${count} feuilles`),
  excel: "Excel",
  valuePlaceholder: "Valeur",
  valueOrFormulaPlaceholder: "Valeur ou formule (ex. 100 ou SUM(B2:B11))",
  formatPlaceholder: "Format (ex. $#,##0.00)",
  loading: "Chargement du tableur...",
  noData: "Aucune donnée de tableur disponible",
  editData: "Modifier les données du tableur",
  applyChanges: "Appliquer les modifications",
  dataMustBeArray: "Les données doivent être un tableau de feuilles",
  loadFailed: (error) => `Échec du chargement du tableur : ${error}`,
  saveFailed: (error) => `Échec de l'enregistrement du tableur : ${error}`,
  fileChangedElsewhere:
    "Ce tableur a été modifié ailleurs. Vos modifications dans Edit Spreadsheet Data ne sont pas encore appliquées ; en les appliquant, vous choisirez de garder cette modification ou de la remplacer.",
  saveConflict: "Votre modification n’a pas été enregistrée : ce tableur a été modifié ailleurs après son ouverture.",
  useFileVersion: "Utiliser la version enregistrée",
  overwriteWithMine: "Remplacer par ma modification",
  cellEditorClosedByChange: "Ce tableur a été modifié ailleurs, l’éditeur de cellule a donc été fermé. Cliquez à nouveau sur la cellule pour la modifier.",
  invalidJsonAlert: (error) => `Format JSON non valide : ${error}`,
  unknownError: "Erreur inconnue",
  update: "Mettre à jour",
  stringType: "Texte",
  formulaType: "Formule",
};

export default fr;
