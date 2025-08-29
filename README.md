# Flashcard Generator

A web-based application to automatically generate and study flashcards from text, documents, or topics using AI.

## Features

-   **AI-Powered Generation**: Paste any text, article, or topic, and the application will intelligently create flashcards with terms and definitions.
-   **File Import**: Supports importing `.txt`, `.docx`, and `.pdf` files to generate study sets from your existing notes and documents.
-   **OCR for PDFs**: Includes an option to perform Optical Character Recognition (OCR) on scanned PDFs to extract text from images.
-   **Customizable Study Sessions**: Set a timer and choose your study mode (Term first or Definition first) for focused learning.
-   **Interactive Flashcards**: Flip cards with a simple click to reveal the answer.
-   **Export**: Save your generated flashcard sets as a `.txt` file for offline use or sharing.

## How to Use

1.  **Generate**: Open the application, paste your text into the text area, and click "Generate Flashcards".
2.  **Import**: Click the "Import" button to upload a `.txt`, `.docx`, or `.pdf` file.
3.  **Study**: Once your flashcards are ready, set a timer, choose your study mode, and start your session.
4.  **Export**: After a set is generated, you can export it for later use.

## Technologies Used

-   HTML5, CSS3, JavaScript
-   Google Gemini API for AI-powered content generation.
-   `pdf.js` for PDF rendering and text extraction.
-   `Tesseract.js` for client-side OCR.
-   `mammoth.js` for parsing `.docx` files.
