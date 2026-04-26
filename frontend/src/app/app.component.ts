import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './components/header/header.component';
import { ChatWindowComponent } from './components/chat-window/chat-window.component';
import { ChatService, UpcomingElection } from './services/chat.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, HeaderComponent, ChatWindowComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'Indian Election Guide';
  upcomingElections: UpcomingElection[] = [];
  isLoadingElections = true;

  funFacts = [
    { 
      text: "In the 2019 elections, a polling station was set up for just ONE voter in Gir Forest, Gujarat.", 
      query: "Tell me more about the polling station in Gir Forest for a single voter."
    },
    { 
      text: "The first general elections in India (1951-52) took 4 months to complete!", 
      query: "Why did the first Indian general elections take 4 months?"
    },
    { 
      text: "Voters in India use Indelible Ink which contains silver nitrate and can stay for weeks.", 
      query: "How does the voting ink (silver nitrate) work and why is it used?"
    },
    { 
      text: "Syam Saran Negi was the first person to cast a vote in independent India.", 
      query: "Who was Syam Saran Negi and what is his contribution to Indian elections?"
    }
  ];

  currentFact = this.funFacts[0];

  constructor(private chatService: ChatService) {}

  ngOnInit() {
    this.fetchElections();
    this.rotateFact();
  }

  rotateFact() {
    let index = 0;
    setInterval(() => {
      index = (index + 1) % this.funFacts.length;
      this.currentFact = this.funFacts[index];
    }, 10000); // Rotate every 10 seconds
  }

  fetchElections() {
    this.chatService.getUpcomingElections().subscribe({
      next: (data) => {
        this.upcomingElections = data;
        this.isLoadingElections = false;
      },
      error: (err) => {
        console.error('Failed to load elections', err);
        this.isLoadingElections = false;
      }
    });
  }

  askAboutFact() {
    this.chatService.triggerMessage(this.currentFact.query);
  }
}
