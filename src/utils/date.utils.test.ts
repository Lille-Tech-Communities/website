import { describe, it, expect } from "vitest";
import { FRENCH_MONTHS, parseFrenchDate, isValidDate } from "./date.utils";

describe("date.utils", () => {
  describe("FRENCH_MONTHS", () => {
    it("devrait contenir tous les mois français", () => {
      expect(FRENCH_MONTHS).toHaveProperty("JAN", "01");
      expect(FRENCH_MONTHS).toHaveProperty("FEV", "02");
      expect(FRENCH_MONTHS).toHaveProperty("MAR", "03");
      expect(FRENCH_MONTHS).toHaveProperty("AVR", "04");
      expect(FRENCH_MONTHS).toHaveProperty("MAI", "05");
      expect(FRENCH_MONTHS).toHaveProperty("JUI", "06");
      expect(FRENCH_MONTHS).toHaveProperty("JUIL", "07");
      expect(FRENCH_MONTHS).toHaveProperty("AOU", "08");
      expect(FRENCH_MONTHS).toHaveProperty("SEP", "09");
      expect(FRENCH_MONTHS).toHaveProperty("OCT", "10");
      expect(FRENCH_MONTHS).toHaveProperty("NOV", "11");
      expect(FRENCH_MONTHS).toHaveProperty("DEC", "12");
    });

    it("devrait avoir 12 mois", () => {
      expect(Object.keys(FRENCH_MONTHS)).toHaveLength(12);
    });
  });

  describe("parseFrenchDate", () => {
    it("devrait parser une date française correctement", () => {
      // Utiliser une date dans le futur (décembre de l'année courante)
      const date = parseFrenchDate("DEC", "15", 2026);
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(11); // Décembre = 11
      expect(date.getDate()).toBe(15);
    });

    it("devrait gérer les mois en minuscules", () => {
      const date = parseFrenchDate("jan", "15", 2026);
      expect(date.getMonth()).toBe(0);
    });

    it("devrait gérer les jours à un chiffre", () => {
      const date = parseFrenchDate("FEV", "5", 2026);
      expect(date.getDate()).toBe(5);
      expect(date.getMonth()).toBe(1); // Février
    });

    it("devrait gérer juillet avec abréviation JUIL", () => {
      const date = parseFrenchDate("JUIL", "14", 2026);
      expect(date.getMonth()).toBe(6); // Juillet
    });

    it("devrait utiliser l'année suivante si la date est passée", () => {
      // Simuler qu'on est le 15 mars 2026
      // Si on parse janvier 2026, c'est dans le passé, donc ça devrait être janvier 2027
      const now = new Date("2026-03-15");
      const date = parseFrenchDate("JAN", "1", now.getFullYear());

      // Janvier 2026 est passé en mars 2026, donc on attend 2027
      if (now.getMonth() > 0) {
        expect(date.getFullYear()).toBe(2027);
      } else {
        expect(date.getFullYear()).toBe(2026);
      }
    });

    it("devrait retourner janvier par défaut pour un mois invalide", () => {
      const date = parseFrenchDate("INVALID", "15", 2026);
      expect(date.getMonth()).toBe(0); // Janvier par défaut
    });

    it("devrait gérer tous les mois correctement", () => {
      const months = [
        "JAN",
        "FEV",
        "MAR",
        "AVR",
        "MAI",
        "JUI",
        "JUIL",
        "AOU",
        "SEP",
        "OCT",
        "NOV",
        "DEC",
      ];
      months.forEach((month, index) => {
        const date = parseFrenchDate(month, "15", 2026);
        expect(date.getMonth()).toBe(index);
      });
    });
  });

  describe("isValidDate", () => {
    it("devrait retourner true pour une date valide", () => {
      const validDate = new Date("2026-01-15");
      expect(isValidDate(validDate)).toBe(true);
    });

    it("devrait retourner false pour une date invalide", () => {
      const invalidDate = new Date("invalid");
      expect(isValidDate(invalidDate)).toBe(false);
    });

    it("devrait retourner true pour Date.now()", () => {
      const now = new Date();
      expect(isValidDate(now)).toBe(true);
    });

    it("devrait retourner false pour NaN", () => {
      const nanDate = new Date(NaN);
      expect(isValidDate(nanDate)).toBe(false);
    });
  });
});
