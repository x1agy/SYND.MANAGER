import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { CONTRACTS_SHEET_ID, GOOGLE_API } from "../constants/envVars";
import { contractsSheetsPaths } from "../constants/contracts";

class ContractsService {
    private sheets: any;

    constructor() {
        const auth = new GoogleAuth({
            credentials: JSON.parse(GOOGLE_API),
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });

        this.sheets = google.sheets({ version: "v4", auth });
    }

    async addReport(
        name: string,
        essenceNumber: number,
        screenshotLink: string
    ): Promise<void> {
        const values = [[name, essenceNumber, screenshotLink, new Date().toISOString()]];

        await this.sheets.spreadsheets.values.append({
            spreadsheetId: CONTRACTS_SHEET_ID,
            range: `${contractsSheetsPaths.contracts}!A:D`,
            valueInputOption: "USER_ENTERED",
            requestBody: {
                values,
            },
        });
    }
}

export default new ContractsService();